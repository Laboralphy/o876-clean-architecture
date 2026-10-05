import path from 'node:path';
import type { AppSettings } from '../application/ports/services';

export type BootSettings = {
    port: number;
    storage: 'memory' | 'json';
    dataDirectory: string;
    app: AppSettings;
    log: (line: string) => void;
};

/** Reads the environment once, at boot. Nothing below this file sees `process.env`. */
export function readSettings(env: NodeJS.ProcessEnv = process.env): BootSettings {
    const storage = env.STORAGE ?? 'memory';
    if (storage !== 'memory' && storage !== 'json') {
        throw new TypeError('STORAGE must be "memory" or "json"');
    }
    return {
        port: Number.parseInt(env.PORT ?? '8080', 10),
        storage,
        dataDirectory: path.resolve(env.DATA_DIRECTORY ?? './data'),
        app: {
            reservedNames: ['new', 'admin', 'system'],
            mailMaxLength: 2000,
            adminNames: (env.ADMIN_NAMES ?? 'ralphy').split(',').map((n) => n.trim()),
        },
        log: (line) => console.log(line),
    };
}
