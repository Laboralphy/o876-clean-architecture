import type {
    AppSettings,
    IClock,
    IIdGenerator,
    INotifier,
    IPasswordHasher,
    Notification,
} from '../../src/application/ports/services';
import { MemoryDocumentStore } from '../../src/infrastructure/persistence/MemoryDocumentStore';
import {
    MailRepository,
    UserRepository,
    UserSecretRepository,
} from '../../src/infrastructure/persistence/repositories';
import { InMemorySessionRegistry } from '../../src/infrastructure/services/InMemorySessionRegistry';
import { StaticAppConfig } from '../../src/infrastructure/services/basic';

/**
 * Use-case tests need no container: a use case is a class taking a plain object.
 * The fakes are typed against the ports, so a port change breaks the fake at compile
 * time (an `AwilixContainer<any>` with `asValue({...})` partial fakes would drift silently).
 */
export class FakeClock implements IClock {
    constructor(public time = 1_000_000) {}
    now(): number {
        return this.time;
    }
}

export class SequentialIds implements IIdGenerator {
    private next = 0;
    generate(): string {
        return `id${++this.next}`;
    }
}

/** Not a real hash — fast and readable in assertions. */
export class PlainHasher implements IPasswordHasher {
    async hash(password: string): Promise<string> {
        return `plain:${password}`;
    }
    async verify(password: string, hash: string): Promise<boolean> {
        return hash === `plain:${password}`;
    }
}

export class RecordingNotifier implements INotifier {
    readonly sent: { userId: string; notification: Notification }[] = [];
    async notify(userId: string, notification: Notification): Promise<void> {
        this.sent.push({ userId, notification });
    }
}

export const testSettings: AppSettings = {
    reservedNames: ['new'],
    mailMaxLength: 100,
    adminNames: ['boss'],
};

/** A full set of deps, built from real in-memory adapters plus deterministic fakes. */
export function makeDeps() {
    const documentStore = new MemoryDocumentStore();
    return {
        userRepository: new UserRepository({ documentStore }),
        userSecretRepository: new UserSecretRepository({ documentStore }),
        mailRepository: new MailRepository({ documentStore }),
        sessionRegistry: new InMemorySessionRegistry(),
        appConfig: new StaticAppConfig({ settings: testSettings }),
        passwordHasher: new PlainHasher(),
        idGenerator: new SequentialIds(),
        clock: new FakeClock(),
        notifier: new RecordingNotifier(),
    };
}
