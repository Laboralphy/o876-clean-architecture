/**
 * A low-level key/document store, shared by every repository implementation.
 *
 * It lives here, in infrastructure, and not in domain/ports: no use case ever talks to
 * it. It is a contract *between* infrastructure classes (repositories → store), so the
 * domain does not need to know that the word "collection" exists.
 */
export type Document = { id: string } & Record<string, unknown>;

export interface IDocumentStore {
    init(): Promise<void>;
    get(collection: string, id: string): Promise<unknown | undefined>;
    put(collection: string, doc: Document): Promise<void>;
    remove(collection: string, id: string): Promise<void>;
    /** Returns every document whose fields equal the ones in `query`. */
    find(collection: string, query: Record<string, unknown>): Promise<unknown[]>;
}
