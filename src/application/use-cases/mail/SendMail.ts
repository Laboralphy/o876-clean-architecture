import type { IMailRepository, IUserRepository } from '../../../domain/ports/repositories';
import type {
    IAppConfig,
    IClock,
    IIdGenerator,
    INotifier,
    ISessionRegistry,
} from '../../ports/services';
import type { SendMailDto } from '../../dto';
import type { MailMessage } from '../../../domain/entities/MailMessage';
import { DomainError } from '../../../domain/errors';

export type SendMailDeps = {
    userRepository: IUserRepository;
    mailRepository: IMailRepository;
    sessionRegistry: ISessionRegistry;
    notifier: INotifier;
    idGenerator: IIdGenerator;
    clock: IClock;
    appConfig: IAppConfig;
};

/**
 * Stores the message, and pings the recipient if they are online.
 * The message is always stored: an online recipient who misses the notification can
 * still read it later.
 */
export class SendMail {
    private readonly deps: SendMailDeps;

    constructor({
        userRepository,
        mailRepository,
        sessionRegistry,
        notifier,
        idGenerator,
        clock,
        appConfig,
    }: SendMailDeps) {
        this.deps = {
            userRepository,
            mailRepository,
            sessionRegistry,
            notifier,
            idGenerator,
            clock,
            appConfig,
        };
    }

    async execute(senderId: string, dto: SendMailDto): Promise<MailMessage> {
        const { userRepository, mailRepository, sessionRegistry, notifier } = this.deps;

        const sender = await userRepository.get(senderId);
        if (!sender) {
            throw DomainError.notFound('User', senderId);
        }
        const recipient = await userRepository.findByName(dto.to);
        if (!recipient) {
            throw DomainError.notFound('User', dto.to);
        }
        const maxLength = this.deps.appConfig.get().mailMaxLength;
        if (dto.content.length > maxLength) {
            throw new DomainError('INVALID', `Message longer than ${maxLength} characters`);
        }

        const message: MailMessage = {
            id: this.deps.idGenerator.generate(),
            senderId: sender.id,
            recipientId: recipient.id,
            content: dto.content,
            tsSent: this.deps.clock.now(),
            read: false,
        };
        await mailRepository.save(message);

        if (sessionRegistry.isOnline(recipient.id)) {
            await notifier.notify(recipient.id, {
                type: 'mail-received',
                from: sender.displayName,
                preview: dto.content.slice(0, 40),
            });
        }
        return message;
    }
}
