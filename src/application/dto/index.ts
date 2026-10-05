import z from 'zod';
import { DisplayName, EmailString, UserName } from '../../domain/schemas';

/*
 * Application DTOs: the input contract of the use cases, independent of any transport.
 * Delivery adapters (HTTP, CLI…) parse their own payloads into these.
 */

export const CreateUserDtoSchema = z
    .object({
        name: UserName,
        displayName: DisplayName,
        email: EmailString,
        password: z.string().min(8).max(1000),
    })
    .strict();
export type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

export const AuthenticateDtoSchema = z
    .object({
        name: z.string().max(100),
        password: z.string().max(1000),
    })
    .strict();
export type AuthenticateDto = z.infer<typeof AuthenticateDtoSchema>;

export const BanUserDtoSchema = z
    .object({
        reason: z.string().max(1000),
        /** Omitted or null: forever. */
        durationMs: z.number().int().positive().nullable().default(null),
    })
    .strict();
export type BanUserDto = z.infer<typeof BanUserDtoSchema>;

export const SendMailDtoSchema = z
    .object({
        to: UserName,
        content: z.string().min(1),
    })
    .strict();
export type SendMailDto = z.infer<typeof SendMailDtoSchema>;
