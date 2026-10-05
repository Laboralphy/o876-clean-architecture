import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContainer, createRequestScope } from '../src/boot/container';
import { readSettings } from '../src/boot/settings';
import { createHttpServer } from '../src/infrastructure/http/HttpServer';
import { routes } from '../src/infrastructure/http/routes';

/** The real container, the real adapters, over real HTTP. */
describe('HTTP API', () => {
    const logs: string[] = [];
    let server: http.Server;
    let base: string;

    beforeAll(async () => {
        const settings = {
            ...readSettings({ STORAGE: 'memory', ADMIN_NAMES: 'boss' }),
            log: (line: string) => logs.push(line),
        };
        const container = buildContainer(settings);
        await container.resolve('documentStore').init();
        server = createHttpServer({
            routes,
            createScope: (token) => createRequestScope(container, token),
        });
        await new Promise<void>((resolve) => server.listen(0, resolve));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(() => {
        server.close();
    });

    async function call(method: string, path: string, body?: unknown, token?: string) {
        const response = await fetch(base + path, {
            method,
            headers: token ? { authorization: `Bearer ${token}` } : {},
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        return { status: response.status, body: text ? JSON.parse(text) : undefined };
    }

    it('runs the full story', async () => {
        const register = (name: string, displayName: string) =>
            call('POST', '/users', {
                name,
                displayName,
                email: `${name}@example.com`,
                password: 'long-enough',
            });
        expect((await register('boss', 'Boss')).status).toBe(201);
        const alice = await register('alice', 'Alice');
        expect(alice.status).toBe(201);
        expect(alice.body).not.toHaveProperty('email');

        expect((await register('alice', 'Alicia')).status).toBe(409);
        expect((await call('POST', '/users', { name: 'X' })).status).toBe(422);

        const bossToken = (
            await call('POST', '/sessions', { name: 'boss', password: 'long-enough' })
        ).body.token;
        const aliceToken = (
            await call('POST', '/sessions', { name: 'alice', password: 'long-enough' })
        ).body.token;
        expect((await call('GET', '/me')).status).toBe(401);
        expect((await call('GET', '/me', undefined, aliceToken)).body.name).toBe('alice');

        expect(
            (await call('POST', '/mail', { to: 'alice', content: 'hi!' }, bossToken)).status
        ).toBe(201);
        expect(logs.some((l) => l.includes('mail-received'))).toBe(true);
        const inbox = await call('GET', '/mail', undefined, aliceToken);
        expect(inbox.body).toHaveLength(1);
        expect(inbox.body[0].content).toBe('hi!');

        expect(
            (await call('PUT', `/users/${alice.body.id}/ban`, { reason: 'x' }, aliceToken)).status
        ).toBe(403);
        const ban = await call('PUT', `/users/${alice.body.id}/ban`, { reason: 'spam' }, bossToken);
        expect(ban.body.banned).toBe(true);
        expect((await call('GET', '/me', undefined, aliceToken)).status).toBe(401);
        expect(
            (await call('POST', '/sessions', { name: 'alice', password: 'long-enough' })).status
        ).toBe(403);
    });
});
