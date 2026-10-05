import { randomBytes } from 'node:crypto';
import type { ISessionRegistry } from '../../application/ports/services';

/** Token → user id. A socket server would map connection ids instead. */
export class InMemorySessionRegistry implements ISessionRegistry {
    private readonly sessions = new Map<string, string>();

    open(userId: string): string {
        const token = randomBytes(24).toString('base64url');
        this.sessions.set(token, userId);
        return token;
    }

    close(token: string): void {
        this.sessions.delete(token);
    }

    closeAllForUser(userId: string): number {
        let closed = 0;
        for (const [token, owner] of this.sessions) {
            if (owner === userId) {
                this.sessions.delete(token);
                closed++;
            }
        }
        return closed;
    }

    findUserId(token: string): string | undefined {
        return this.sessions.get(token);
    }

    isOnline(userId: string): boolean {
        return [...this.sessions.values()].includes(userId);
    }
}
