import type { IUserRepository, IUserSecretRepository } from '../../../domain/ports/repositories';
import type { IClock, IPasswordHasher, ISessionRegistry } from '../../ports/services';
import type { AuthenticateDto } from '../../dto';
import { isBanned, type User } from '../../../domain/entities/User';
import { DomainError } from '../../../domain/errors';

export type AuthenticateUserDeps = {
    userRepository: IUserRepository;
    userSecretRepository: IUserSecretRepository;
    passwordHasher: IPasswordHasher;
    sessionRegistry: ISessionRegistry;
    clock: IClock;
};

export type AuthenticationResult = { user: User; token: string };

export class AuthenticateUser {
    private readonly deps: AuthenticateUserDeps;

    constructor({
        userRepository,
        userSecretRepository,
        passwordHasher,
        sessionRegistry,
        clock,
    }: AuthenticateUserDeps) {
        this.deps = {
            userRepository,
            userSecretRepository,
            passwordHasher,
            sessionRegistry,
            clock,
        };
    }

    async execute(dto: AuthenticateDto): Promise<AuthenticationResult> {
        const { userRepository, userSecretRepository, passwordHasher, sessionRegistry, clock } =
            this.deps;

        // Same error for "no such user" and "wrong password": do not reveal which names exist.
        const denied = new DomainError('UNAUTHORIZED', 'Invalid credentials');
        const user = await userRepository.findByName(dto.name);
        if (!user) {
            throw denied;
        }
        const secret = await userSecretRepository.get(user.id);
        if (!secret || !(await passwordHasher.verify(dto.password, secret.passwordHash))) {
            throw denied;
        }
        const now = clock.now();
        if (isBanned(user, now)) {
            throw new DomainError('FORBIDDEN', 'This account is banned');
        }

        // Only now, with the password verified, is the previous session dropped.
        // Dropping it earlier would let anyone disconnect a user by trying their name.
        sessionRegistry.closeAllForUser(user.id);

        const updated: User = { ...user, tsLastUsed: now };
        await userRepository.save(updated);
        return { user: updated, token: sessionRegistry.open(user.id) };
    }
}
