import { randomUUID } from 'node:crypto';
import type {
    AppSettings,
    IAppConfig,
    IClock,
    IIdGenerator,
    INotifier,
    Notification,
} from '../../application/ports/services';

export class SystemClock implements IClock {
    now(): number {
        return Date.now();
    }
}

export class UuidGenerator implements IIdGenerator {
    generate(): string {
        return randomUUID();
    }
}

export type ConsoleNotifierDeps = {
    log: (line: string) => void;
};

/** Logs notifications. A WebSocket or e-mail notifier would implement the same port. */
export class ConsoleNotifier implements INotifier {
    private readonly log: (line: string) => void;

    constructor({ log }: ConsoleNotifierDeps) {
        this.log = log;
    }

    async notify(userId: string, notification: Notification): Promise<void> {
        this.log(`[notify ${userId}] ${JSON.stringify(notification)}`);
    }
}

/** Configuration as a plain value object; the env parsing lives in boot/settings.ts. */
export type StaticAppConfigDeps = {
    settings: AppSettings;
};

export class StaticAppConfig implements IAppConfig {
    private readonly settings: AppSettings;

    constructor({ settings }: StaticAppConfigDeps) {
        this.settings = settings;
    }

    get(): AppSettings {
        return this.settings;
    }
}
