import { beforeEach, describe, expect, it } from 'vitest';
import { CreateUser } from '../src/application/use-cases/users/CreateUser';
import { AuthenticateUser } from '../src/application/use-cases/users/AuthenticateUser';
import { BanUser } from '../src/application/use-cases/users/BanUser';
import { DomainError } from '../src/domain/errors';
import { makeDeps } from './helpers/fakes';

const dto = (over: Partial<{ name: string; displayName: string }> = {}) => ({
    name: 'alice',
    displayName: 'Alice',
    email: 'alice@example.com',
    password: 'correct-horse',
    ...over,
});

describe('users', () => {
    let deps: ReturnType<typeof makeDeps>;
    let createUser: CreateUser;
    let authenticateUser: AuthenticateUser;
    let banUser: BanUser;

    beforeEach(() => {
        deps = makeDeps();
        createUser = new CreateUser(deps);
        authenticateUser = new AuthenticateUser(deps);
        banUser = new BanUser(deps);
    });

    describe('CreateUser', () => {
        it('creates a user and stores the hashed secret separately', async () => {
            const user = await createUser.execute(dto());
            expect(user).toMatchObject({ id: 'id1', name: 'alice', roles: [], ban: null });
            expect(await deps.userSecretRepository.get(user.id)).toEqual({
                id: user.id,
                passwordHash: 'plain:correct-horse',
            });
        });

        it('writes nothing when the name is taken', async () => {
            await createUser.execute(dto());
            await expect(createUser.execute(dto({ displayName: 'Other' }))).rejects.toMatchObject({
                code: 'ALREADY_EXISTS',
            });
            expect(await deps.userSecretRepository.get('id2')).toBeUndefined();
        });

        it('refuses reserved names', async () => {
            await expect(
                createUser.execute(dto({ name: 'new', displayName: 'Newbie' }))
            ).rejects.toMatchObject({ code: 'RESERVED' });
        });
    });

    describe('AuthenticateUser', () => {
        it('opens a session for valid credentials', async () => {
            const user = await createUser.execute(dto());
            const { token } = await authenticateUser.execute({
                name: 'alice',
                password: 'correct-horse',
            });
            expect(deps.sessionRegistry.findUserId(token)).toBe(user.id);
        });

        it('a wrong password does NOT disconnect the logged-in user', async () => {
            await createUser.execute(dto());
            const { token } = await authenticateUser.execute({
                name: 'alice',
                password: 'correct-horse',
            });

            await expect(
                authenticateUser.execute({ name: 'alice', password: 'guess' })
            ).rejects.toBeInstanceOf(DomainError);

            expect(deps.sessionRegistry.findUserId(token)).toBeDefined();
        });

        it('a new valid login replaces the previous session', async () => {
            await createUser.execute(dto());
            const first = await authenticateUser.execute({
                name: 'alice',
                password: 'correct-horse',
            });
            const second = await authenticateUser.execute({
                name: 'alice',
                password: 'correct-horse',
            });
            expect(deps.sessionRegistry.findUserId(first.token)).toBeUndefined();
            expect(deps.sessionRegistry.findUserId(second.token)).toBeDefined();
        });
    });

    describe('BanUser', () => {
        it('lets an admin ban, kicks and notifies the target, then refuses their login', async () => {
            const boss = await createUser.execute(dto({ name: 'boss', displayName: 'Boss' }));
            const alice = await createUser.execute(dto());
            await authenticateUser.execute({ name: 'alice', password: 'correct-horse' });

            await banUser.execute(boss.id, alice.id, { reason: 'spam', durationMs: 60_000 });

            expect(deps.sessionRegistry.isOnline(alice.id)).toBe(false);
            expect(deps.notifier.sent).toEqual([
                {
                    userId: alice.id,
                    notification: { type: 'banned', reason: 'spam', until: 1_060_000 },
                },
            ]);
            await expect(
                authenticateUser.execute({ name: 'alice', password: 'correct-horse' })
            ).rejects.toMatchObject({ code: 'FORBIDDEN' });

            // The ban expires: time is a port, so the test moves it.
            deps.clock.time += 60_001;
            await expect(
                authenticateUser.execute({ name: 'alice', password: 'correct-horse' })
            ).resolves.toBeDefined();
        });

        it('refuses a ban from a regular user', async () => {
            const alice = await createUser.execute(dto());
            const bob = await createUser.execute(dto({ name: 'bob', displayName: 'Bob' }));
            await expect(
                banUser.execute(alice.id, bob.id, { reason: 'no', durationMs: null })
            ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        });
    });
});
