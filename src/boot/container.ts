/**
 * Composition root — the ONLY file that knows both the ports and their implementations.
 *
 * Wiring mistakes are caught at compile time, not on the first resolve():
 *
 *  1. Nobody imports `Cradle` except this file and boot code. Use cases and adapters
 *     declare their own `XxxDeps` type; `singleton(X)` below only compiles if the Cradle
 *     provides every dependency of X with a compatible type.
 *  2. `registrations` is typed `Registrations<Cradle>`: forgetting to register a Cradle
 *     entry, or binding a class that doesn't implement the declared port, is a type error
 *     instead of a runtime "Could not resolve 'xxx'".
 *  3. `strict: true`: a singleton that (directly or not) depends on a request-scoped
 *     registration throws instead of silently capturing the first request's value.
 */
import {
    asClass,
    asFunction,
    asValue,
    type AwilixContainer,
    createContainer,
    InjectionMode,
    type Resolver,
} from 'awilix';

import type {
    IMailRepository,
    IUserRepository,
    IUserSecretRepository,
} from '../domain/ports/repositories';
import type {
    AppSettings,
    IAppConfig,
    IClock,
    IIdGenerator,
    INotifier,
    IPasswordHasher,
    ISessionRegistry,
} from '../application/ports/services';

import { CreateUser } from '../application/use-cases/users/CreateUser';
import { AuthenticateUser } from '../application/use-cases/users/AuthenticateUser';
import { GetUser } from '../application/use-cases/users/GetUser';
import { BanUser } from '../application/use-cases/users/BanUser';
import { SendMail } from '../application/use-cases/mail/SendMail';
import { ReadInbox } from '../application/use-cases/mail/ReadInbox';

import type { IDocumentStore } from '../infrastructure/persistence/IDocumentStore';
import { MemoryDocumentStore } from '../infrastructure/persistence/MemoryDocumentStore';
import { JsonFileDocumentStore } from '../infrastructure/persistence/JsonFileDocumentStore';
import {
    MailRepository,
    UserRepository,
    UserSecretRepository,
} from '../infrastructure/persistence/repositories';
import { ScryptPasswordHasher } from '../infrastructure/services/ScryptPasswordHasher';
import { InMemorySessionRegistry } from '../infrastructure/services/InMemorySessionRegistry';
import {
    ConsoleNotifier,
    StaticAppConfig,
    SystemClock,
    UuidGenerator,
} from '../infrastructure/services/basic';
import { UserController } from '../infrastructure/http/controllers/UserController';
import { MailController } from '../infrastructure/http/controllers/MailController';
import type { RequestScope } from '../infrastructure/http/HttpServer';

import type { BootSettings } from './settings';

/** Everything resolvable from the root container. Ports are typed as interfaces. */
export interface Cradle {
    // values
    settings: AppSettings;
    dataDirectory: string;
    log: (line: string) => void;

    // infrastructure-internal
    documentStore: IDocumentStore;

    // repositories
    userRepository: IUserRepository;
    userSecretRepository: IUserSecretRepository;
    mailRepository: IMailRepository;

    // services
    clock: IClock;
    idGenerator: IIdGenerator;
    passwordHasher: IPasswordHasher;
    sessionRegistry: ISessionRegistry;
    notifier: INotifier;
    appConfig: IAppConfig;

    // use cases
    createUser: CreateUser;
    authenticateUser: AuthenticateUser;
    getUser: GetUser;
    banUser: BanUser;
    sendMail: SendMail;
    readInbox: ReadInbox;
}

/** One HTTP request. For a socket server, the same pattern gives one scope per connection. */
export interface RequestCradle extends Cradle {
    currentUserId: string | null;
    userController: UserController;
    mailController: MailController;
}

type Registrations<C> = { [K in keyof C]: Resolver<C[K]> };

/*
 * Typed wrappers around asClass(). Awilix's own `Constructor<T>` is `new (...args: any[])`,
 * so `asClass(CreateUser)` would accept a class whose dependencies are not in the cradle.
 * Requiring `new (cradle: Cradle) => T` makes TypeScript check, by parameter
 * contravariance, that `Cradle` is assignable to the class's `XxxDeps`.
 */
const singleton = <T>(cls: new (cradle: Cradle) => T) => asClass(cls).singleton();
const scoped = <T>(cls: new (cradle: RequestCradle) => T) => asClass(cls).scoped();

/** Adapter chosen by configuration: the use cases never know which one is running. */
function selectDocumentStore(driver: BootSettings['storage']) {
    return (cradle: Cradle): IDocumentStore => {
        switch (driver) {
            case 'memory':
                return new MemoryDocumentStore();
            case 'json':
                return new JsonFileDocumentStore(cradle);
        }
    };
}

export function buildContainer(boot: BootSettings): AwilixContainer<Cradle> {
    const container = createContainer<Cradle>({
        injectionMode: InjectionMode.PROXY,
        strict: true,
    });

    const registrations: Registrations<Cradle> = {
        settings: asValue(boot.app),
        dataDirectory: asValue(boot.dataDirectory),
        log: asValue(boot.log),

        documentStore: asFunction(selectDocumentStore(boot.storage)).singleton(),

        userRepository: singleton(UserRepository),
        userSecretRepository: singleton(UserSecretRepository),
        mailRepository: singleton(MailRepository),

        clock: singleton(SystemClock),
        idGenerator: singleton(UuidGenerator),
        passwordHasher: singleton(ScryptPasswordHasher),
        sessionRegistry: singleton(InMemorySessionRegistry),
        notifier: singleton(ConsoleNotifier),
        appConfig: singleton(StaticAppConfig),

        createUser: singleton(CreateUser),
        authenticateUser: singleton(AuthenticateUser),
        getUser: singleton(GetUser),
        banUser: singleton(BanUser),
        sendMail: singleton(SendMail),
        readInbox: singleton(ReadInbox),
    };
    container.register(registrations);

    // Scoped registrations live on the root and are instantiated once per scope.
    // `currentUserId` itself is only known per request, see createRequestScope().
    const requestRegistrations: Registrations<Omit<RequestCradle, keyof Cradle | 'currentUserId'>> =
        {
            userController: scoped(UserController),
            mailController: scoped(MailController),
        };
    container.register(requestRegistrations);

    return container;
}

export function createRequestScope(
    container: AwilixContainer<Cradle>,
    bearerToken: string | undefined
): RequestScope & { container: AwilixContainer<RequestCradle> } {
    const scope = container.createScope<RequestCradle>();
    const sessionRegistry = container.resolve('sessionRegistry');
    const currentUserId = bearerToken ? (sessionRegistry.findUserId(bearerToken) ?? null) : null;
    scope.register({ currentUserId: asValue(currentUserId) });
    return {
        container: scope,
        cradle: scope.cradle,
        dispose: () => scope.dispose(),
    };
}
