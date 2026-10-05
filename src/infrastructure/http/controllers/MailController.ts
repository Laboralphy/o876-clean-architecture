import type { SendMail } from '../../../application/use-cases/mail/SendMail';
import type { ReadInbox } from '../../../application/use-cases/mail/ReadInbox';
import { SendMailDtoSchema } from '../../../application/dto';
import type { HttpRequest, HttpResponse } from '../types';
import { requireUser } from './requireUser';

export type MailControllerDeps = {
    sendMail: SendMail;
    readInbox: ReadInbox;
    currentUserId: string | null;
};

export class MailController {
    private readonly deps: MailControllerDeps;

    constructor({ sendMail, readInbox, currentUserId }: MailControllerDeps) {
        this.deps = { sendMail, readInbox, currentUserId };
    }

    async send(request: HttpRequest): Promise<HttpResponse> {
        const senderId = requireUser(this.deps.currentUserId);
        const message = await this.deps.sendMail.execute(
            senderId,
            SendMailDtoSchema.parse(request.body)
        );
        return { status: 201, body: { id: message.id } };
    }

    async inbox(): Promise<HttpResponse> {
        const messages = await this.deps.readInbox.execute(requireUser(this.deps.currentUserId));
        return { status: 200, body: messages };
    }
}
