import type { IMailRepository } from '../../../domain/ports/repositories';
import type { MailMessage } from '../../../domain/entities/MailMessage';

export type ReadInboxDeps = {
    mailRepository: IMailRepository;
};

/** Returns the user's mail, oldest first, and marks it as read. */
export class ReadInbox {
    private readonly deps: ReadInboxDeps;

    constructor({ mailRepository }: ReadInboxDeps) {
        this.deps = { mailRepository };
    }

    async execute(userId: string): Promise<MailMessage[]> {
        const messages = await this.deps.mailRepository.listForRecipient(userId);
        messages.sort((a, b) => a.tsSent - b.tsSent);
        for (const message of messages.filter((m) => !m.read)) {
            await this.deps.mailRepository.save({ ...message, read: true });
        }
        return messages;
    }
}
