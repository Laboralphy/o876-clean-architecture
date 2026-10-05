import z from 'zod';
import { EntityId } from '../schemas';

/**
 * Credentials are stored apart from the User so that "list users" or "get user" can
 * never leak them by accident.
 */
export const UserSecretSchema = z
    .object({
        id: EntityId,
        passwordHash: z.string().min(1),
    })
    .strict();

export type UserSecret = z.infer<typeof UserSecretSchema>;
