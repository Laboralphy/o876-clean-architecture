import z from 'zod';
import { DisplayName, EmailString, EntityId, Timestamp, UserName } from '../schemas';

export const ROLES = ['admin', 'moderator'] as const;
export type Role = (typeof ROLES)[number];

export const BanSchema = z
    .object({
        tsBegin: Timestamp,
        /** `null` means forever: one field, no contradictory states. */
        tsEnd: Timestamp.nullable(),
        reason: z.string().max(1000),
        bannedBy: EntityId,
    })
    .strict();

export type Ban = z.infer<typeof BanSchema>;

export const UserSchema = z
    .object({
        id: EntityId,
        name: UserName,
        displayName: DisplayName,
        email: EmailString,
        tsCreation: Timestamp,
        tsLastUsed: Timestamp,
        roles: z.array(z.enum(ROLES)),
        ban: BanSchema.nullable(),
    })
    .strict();

export type User = z.infer<typeof UserSchema>;

/*
 * Domain rules live next to the data as pure functions. They need no port, no clock
 * (time is a parameter) and no container: the cheapest code in the system to test.
 * A rule placed inside a use case can only be tested through fakes of its ports;
 * a rule placed here is tested with plain values.
 */

export function hasRole(user: User, role: Role): boolean {
    return user.roles.includes(role);
}

export function isBanned(user: User, now: number): boolean {
    if (!user.ban) {
        return false;
    }
    return user.ban.tsEnd === null || user.ban.tsEnd > now;
}

export function canBan(actor: User, target: User): boolean {
    if (actor.id === target.id || hasRole(target, 'admin')) {
        return false;
    }
    return hasRole(actor, 'admin') || hasRole(actor, 'moderator');
}

export function withBan(
    user: User,
    ban: { now: number; durationMs: number | null; reason: string; bannedBy: string }
): User {
    return {
        ...user,
        ban: {
            tsBegin: ban.now,
            tsEnd: ban.durationMs === null ? null : ban.now + ban.durationMs,
            reason: ban.reason,
            bannedBy: ban.bannedBy,
        },
    };
}
