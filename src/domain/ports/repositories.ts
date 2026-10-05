import type { MailMessage } from '../entities/MailMessage';
import type { User } from '../entities/User';
import type { UserSecret } from '../entities/UserSecret';

/**
 * Repository ports: collection-like access to aggregates, expressed in domain terms.
 * Nothing here says "table", "collection", "key" or "JSON" — that vocabulary belongs to
 * the infrastructure (see infrastructure/persistence/IDocumentStore.ts).
 */
export interface IRepository<T extends { id: string }> {
    get(id: string): Promise<T | undefined>;
    save(entity: T): Promise<void>;
    delete(id: string): Promise<void>;
}

export interface IUserRepository extends IRepository<User> {
    findByName(name: string): Promise<User | undefined>;
    findByDisplayName(displayName: string): Promise<User | undefined>;
}

export type IUserSecretRepository = IRepository<UserSecret>;

export interface IMailRepository extends IRepository<MailMessage> {
    listForRecipient(recipientId: string): Promise<MailMessage[]>;
}
