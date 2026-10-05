import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { IPasswordHasher } from '../../application/ports/services';

const scryptAsync = promisify(scrypt) as (
    password: string,
    salt: Buffer,
    keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/** Salted scrypt, stored as `scrypt$<salt hex>$<hash hex>`. */
export class ScryptPasswordHasher implements IPasswordHasher {
    async hash(password: string): Promise<string> {
        const salt = randomBytes(16);
        const hash = await scryptAsync(password, salt, KEY_LENGTH);
        return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
    }

    async verify(password: string, stored: string): Promise<boolean> {
        const [algorithm, saltHex, hashHex] = stored.split('$');
        if (algorithm !== 'scrypt' || !saltHex || !hashHex) {
            return false;
        }
        const expected = Buffer.from(hashHex, 'hex');
        const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
        return timingSafeEqual(expected, actual);
    }
}
