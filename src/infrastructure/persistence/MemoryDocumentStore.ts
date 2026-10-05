import type { Document, IDocumentStore } from './IDocumentStore';

export class MemoryDocumentStore implements IDocumentStore {
    protected readonly collections = new Map<string, Map<string, Document>>();

    async init(): Promise<void> {}

    protected collection(name: string): Map<string, Document> {
        let collection = this.collections.get(name);
        if (!collection) {
            collection = new Map();
            this.collections.set(name, collection);
        }
        return collection;
    }

    async get(collection: string, id: string): Promise<unknown | undefined> {
        const doc = this.collection(collection).get(id);
        return doc && structuredClone(doc);
    }

    async put(collection: string, doc: Document): Promise<void> {
        this.collection(collection).set(doc.id, structuredClone(doc));
    }

    async remove(collection: string, id: string): Promise<void> {
        this.collection(collection).delete(id);
    }

    async find(collection: string, query: Record<string, unknown>): Promise<unknown[]> {
        const entries = Object.entries(query);
        return [...this.collection(collection).values()]
            .filter((doc) => entries.every(([key, value]) => doc[key] === value))
            .map((doc) => structuredClone(doc));
    }
}
