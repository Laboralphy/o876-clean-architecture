import type { IUserRepository } from '../../../domain/ports/repositories';
import type { IClock, INotifier, ISessionRegistry } from '../../ports/services';
import type { BanUserDto } from '../../dto';
import { canBan, withBan, type User } from '../../../domain/entities/User';
import { DomainError } from '../../../domain/errors';

export type BanUserDeps = {
    userRepository: IUserRepository;
    sessionRegistry: ISessionRegistry;
    notifier: INotifier;
    clock: IClock;
};

export class BanUser {
    private readonly deps: BanUserDeps;

    constructor({ userRepository, sessionRegistry, notifier, clock }: BanUserDeps) {
        this.deps = { userRepository, sessionRegistry, notifier, clock };
    }

    /**
     * @param actorId the user performing the ban — an explicit argument, not ambient
     *                state, so the authorization rule is visible in the signature.
     */
    async execute(actorId: string, targetId: string, dto: BanUserDto): Promise<User> {
        const { userRepository, sessionRegistry, notifier, clock } = this.deps;

        const actor = await userRepository.get(actorId);
        const target = await userRepository.get(targetId);
        if (!actor) {
            throw DomainError.notFound('User', actorId);
        }
        if (!target) {
            throw DomainError.notFound('User', targetId);
        }
        if (!canBan(actor, target)) {
            throw new DomainError('FORBIDDEN', `${actor.name} may not ban ${target.name}`);
        }

        const banned = withBan(target, {
            now: clock.now(),
            durationMs: dto.durationMs,
            reason: dto.reason,
            bannedBy: actor.id,
        });
        await userRepository.save(banned);

        if (sessionRegistry.isOnline(banned.id)) {
            await notifier.notify(banned.id, {
                type: 'banned',
                reason: dto.reason,
                until: banned.ban?.tsEnd ?? null,
            });
            sessionRegistry.closeAllForUser(banned.id);
        }
        return banned;
    }
}
