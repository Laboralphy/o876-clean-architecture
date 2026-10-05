import type { IUserRepository, IUserSecretRepository } from '../../../domain/ports/repositories';
import type { IAppConfig, IClock, IIdGenerator, IPasswordHasher } from '../../ports/services';
import type { CreateUserDto } from '../../dto';
import { type User, UserSchema } from '../../../domain/entities/User';
import { DomainError } from '../../../domain/errors';

/**
 * The use case states its own dependencies. It never imports the container's
 * `Cradle`: the composition root depends on the use case, never the reverse.
 * boot/container.ts checks at compile time that the Cradle satisfies this type.
 */
export type CreateUserDeps = {
    userRepository: IUserRepository;
    userSecretRepository: IUserSecretRepository;
    passwordHasher: IPasswordHasher;
    idGenerator: IIdGenerator;
    clock: IClock;
    appConfig: IAppConfig;
};

export class CreateUser {
    private readonly deps: CreateUserDeps;

    constructor({
        userRepository,
        userSecretRepository,
        passwordHasher,
        idGenerator,
        clock,
        appConfig,
    }: CreateUserDeps) {
        // Destructured now, not read lazily off the proxy later: a missing or
        // lifetime-violating dependency fails at construction, under strict mode.
        this.deps = {
            userRepository,
            userSecretRepository,
            passwordHasher,
            idGenerator,
            clock,
            appConfig,
        };
    }

    async execute(dto: CreateUserDto): Promise<User> {
        const { userRepository, userSecretRepository, passwordHasher, idGenerator, clock } =
            this.deps;
        const settings = this.deps.appConfig.get();

        // Every check runs before the first write, so a rejected request leaves no
        // partial data (e.g. an orphan secret) behind.
        const reserved = settings.reservedNames.map((n) => n.toLowerCase());
        if (reserved.includes(dto.name) || reserved.includes(dto.displayName.toLowerCase())) {
            throw new DomainError('RESERVED', `Name is reserved: ${dto.name}`);
        }
        if (await userRepository.findByName(dto.name)) {
            throw DomainError.alreadyExists('User name', dto.name);
        }
        if (await userRepository.findByDisplayName(dto.displayName)) {
            throw DomainError.alreadyExists('Display name', dto.displayName);
        }

        const now = clock.now();
        const user = UserSchema.parse({
            id: idGenerator.generate(),
            name: dto.name,
            displayName: dto.displayName,
            email: dto.email,
            tsCreation: now,
            tsLastUsed: now,
            roles: settings.adminNames.includes(dto.name) ? ['admin'] : [],
            ban: null,
        });
        await userRepository.save(user);
        await userSecretRepository.save({
            id: user.id,
            passwordHash: await passwordHasher.hash(dto.password),
        });
        return user;
    }
}
