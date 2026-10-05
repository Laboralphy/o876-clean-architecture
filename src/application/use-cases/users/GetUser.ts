import type { IUserRepository } from '../../../domain/ports/repositories';
import type { User } from '../../../domain/entities/User';
import { DomainError } from '../../../domain/errors';

export type GetUserDeps = {
    userRepository: IUserRepository;
};

export class GetUser {
    private readonly deps: GetUserDeps;

    constructor({ userRepository }: GetUserDeps) {
        this.deps = { userRepository };
    }

    async execute(id: string): Promise<User> {
        const user = await this.deps.userRepository.get(id);
        if (!user) {
            throw DomainError.notFound('User', id);
        }
        return user;
    }
}
