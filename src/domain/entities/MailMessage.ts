import z from 'zod';
import { EntityId, Timestamp } from '../schemas';

export const MailMessageSchema = z
    .object({
        id: EntityId,
        senderId: EntityId,
        recipientId: EntityId,
        content: z.string().min(1),
        tsSent: Timestamp,
        read: z.boolean(),
    })
    .strict();

export type MailMessage = z.infer<typeof MailMessageSchema>;
