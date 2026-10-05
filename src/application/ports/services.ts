/**
 * Service ports: capabilities the application needs from the outside world.
 * Each one is deliberately narrow — a port is shaped by its consumer, not by the
 * library that happens to implement it.
 */

export interface IClock {
    now(): number;
}

export interface IIdGenerator {
    generate(): string;
}

/**
 * hash() + verify(), both async — not `encrypt(p): string` compared with `===`:
 * a real password hash is salted (hashing twice never gives the same string) and must be
 * compared in constant time. The port's shape is what makes that possible.
 */
export interface IPasswordHasher {
    hash(password: string): Promise<string>;
    verify(password: string, hash: string): Promise<boolean>;
}

/** Who is connected. Reduced to what the use cases need — keep ports narrow. */
export interface ISessionRegistry {
    open(userId: string): string;
    close(token: string): void;
    closeAllForUser(userId: string): number;
    findUserId(token: string): string | undefined;
    isOnline(userId: string): boolean;
}

export type Notification =
    | { type: 'mail-received'; from: string; preview: string }
    | { type: 'banned'; reason: string; until: number | null };

export interface INotifier {
    notify(userId: string, notification: Notification): Promise<void>;
}

export interface AppSettings {
    reservedNames: string[];
    mailMaxLength: number;
    /** Names that receive the `admin` role on account creation (bootstrap). */
    adminNames: string[];
}

export interface IAppConfig {
    get(): AppSettings;
}
