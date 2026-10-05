import type { z } from 'zod';
import type {
    IMailRepository,
    IRepository,
    IUserRepository,
    IUserSecretRepository,
} from '../../domain/ports/repositories';
import { type User, UserSchema } from '../../domain/entities/User';
import { UserSecretSchema } from '../../domain/entities/UserSecret';
import { type MailMessage, MailMessageSchema } from '../../domain/entities/MailMessage';
import type { IDocumentStore } from './IDocumentStore';

export type RepositoryDeps = {
    documentStore: IDocumentStore;
};

/**
 * Generic repository over the document store. Every document read from storage is
 * re-validated through the entity schema: the storage is an untrusted boundary.
 */
abstract class DocumentRepository<T extends { id: string }> implements IRepository<T> {
    protected readonly store: IDocumentStore;

    protected constructor(
        { documentStore }: RepositoryDeps,
        protected readonly collection: string,
        protected readonly schema: z.ZodType<T>
    ) {
        this.store = documentStore;
    }

    async get(id: string): Promise<T | undefined> {
        const doc = await this.store.get(this.collection, id);
        return doc === undefined ? undefined : this.schema.parse(doc);
    }

    async save(entity: T): Promise<void> {
        await this.store.put(this.collection, { ...entity });
    }

    async delete(id: string): Promise<void> {
        await this.store.remove(this.collection, id);
    }

    protected async findAll(query: Partial<T>): Promise<T[]> {
        const docs = await this.store.find(this.collection, query);
        return docs.map((doc) => this.schema.parse(doc));
    }

    protected async findOne(query: Partial<T>): Promise<T | undefined> {
        return (await this.findAll(query))[0];
    }
}

export class UserRepository extends DocumentRepository<User> implements IUserRepository {
    constructor(deps: RepositoryDeps) {
        super(deps, 'users', UserSchema);
    }

    findByName(name: string): Promise<User | undefined> {
        return this.findOne({ name });
    }

    findByDisplayName(displayName: string): Promise<User | undefined> {
        return this.findOne({ displayName });
    }
}

export class UserSecretRepository
    extends DocumentRepository<z.infer<typeof UserSecretSchema>>
    implements IUserSecretRepository
{
    constructor(deps: RepositoryDeps) {
        super(deps, 'user-secrets', UserSecretSchema);
    }
}

export class MailRepository extends DocumentRepository<MailMessage> implements IMailRepository {
    constructor(deps: RepositoryDeps) {
        super(deps, 'mail', MailMessageSchema);
    }

    listForRecipient(recipientId: string): Promise<MailMessage[]> {
        return this.findAll({ recipientId });
    }
}
