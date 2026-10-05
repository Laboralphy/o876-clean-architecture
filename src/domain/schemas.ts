import z from 'zod';

/**
 * Value-object schemas. Zod is the one third-party library the domain is allowed to
 * know about: it is used as a type language (runtime-checked types), not as I/O.
 */
export const EntityId = z.string().min(1).max(64);
export const UserName = z.string().regex(/^[-_a-z0-9]{3,24}$/);
export const DisplayName = z.string().regex(/^[A-Z][-a-zA-Z]{2,23}$/);
export const EmailString = z.email();
export const Timestamp = z.number().int().nonnegative();
