import fs from 'node:fs/promises';
import path from 'node:path';
import type { Document } from './IDocumentStore';
import { MemoryDocumentStore } from './MemoryDocumentStore';

export type JsonFileDocumentStoreDeps = {
    dataDirectory: string;
};

/**
 * In-memory store persisted as one JSON file per collection, rewritten on each change.
 * Good enough for an example; the point is that it is swapped in by configuration
 * without a single use case noticing.
 */
export class JsonFileDocumentStore extends MemoryDocumentStore {
    private readonly dataDirectory: string;

    constructor({ dataDirectory }: JsonFileDocumentStoreDeps) {
        super();
        this.dataDirectory = dataDirectory;
    }

    override async init(): Promise<void> {
        await fs.mkdir(this.dataDirectory, { recursive: true });
        for (const file of await fs.readdir(this.dataDirectory)) {
            if (!file.endsWith('.json')) {
                continue;
            }
            const docs = JSON.parse(
                await fs.readFile(path.join(this.dataDirectory, file), 'utf8')
            ) as Document[];
            this.collections.set(path.basename(file, '.json'), new Map(docs.map((d) => [d.id, d])));
        }
    }

    override async put(collection: string, doc: Document): Promise<void> {
        await super.put(collection, doc);
        await this.flush(collection);
    }

    override async remove(collection: string, id: string): Promise<void> {
        await super.remove(collection, id);
        await this.flush(collection);
    }

    private async flush(collection: string): Promise<void> {
        const docs = [...this.collection(collection).values()];
        await fs.writeFile(
            path.join(this.dataDirectory, `${collection}.json`),
            JSON.stringify(docs, null, 2)
        );
    }
}
