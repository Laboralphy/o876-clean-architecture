import { asClass } from 'awilix';
import { describe, expect, it } from 'vitest';
import { buildContainer, createRequestScope } from '../src/boot/container';
import { readSettings } from '../src/boot/settings';

const settings = { ...readSettings({ STORAGE: 'memory' }), log: () => {} };

describe('composition root', () => {
    it('resolves every registration, root and request-scoped', () => {
        // The type system already proves the wiring is complete; this test proves the
        // runtime agrees (constructors don't throw, strict-mode lifetimes are valid).
        const container = buildContainer(settings);
        const { container: scope } = createRequestScope(container, undefined);
        for (const name of Object.keys(scope.registrations)) {
            expect(() => scope.resolve(name), name).not.toThrow();
        }
    });

    it('creates one controller per request but shares the use cases', () => {
        const container = buildContainer(settings);
        const a = createRequestScope(container, undefined).cradle;
        const b = createRequestScope(container, undefined).cradle;
        expect(a.userController).not.toBe(b.userController);
        expect(container.resolve('createUser')).toBe(container.resolve('createUser'));
    });

    it('strict mode rejects a singleton that depends on a request-scoped service', () => {
        class LeakyService {
            constructor({ userController }: { userController: unknown }) {
                void userController;
            }
        }
        const container = buildContainer(settings);
        container.register({ leaky: asClass(LeakyService).singleton() });
        const { container: scope } = createRequestScope(container, undefined);
        expect(() => scope.resolve('leaky')).toThrow(/shorter lifetime/);
    });

    it('a singleton cannot see per-request values at all: they only exist in the scope', () => {
        class NeedsCurrentUser {
            constructor({ currentUserId }: { currentUserId: string | null }) {
                void currentUserId;
            }
        }
        const container = buildContainer(settings);
        container.register({ leaky: asClass(NeedsCurrentUser).singleton() });
        const { container: scope } = createRequestScope(container, undefined);
        expect(() => scope.resolve('leaky')).toThrow(/Could not resolve 'currentUserId'/);
    });
});
