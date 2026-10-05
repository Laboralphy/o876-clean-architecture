import type { CreateUser } from '../../../application/use-cases/users/CreateUser';
import type { AuthenticateUser } from '../../../application/use-cases/users/AuthenticateUser';
import type { GetUser } from '../../../application/use-cases/users/GetUser';
import type { BanUser } from '../../../application/use-cases/users/BanUser';
import {
    AuthenticateDtoSchema,
    BanUserDtoSchema,
    CreateUserDtoSchema,
} from '../../../application/dto';
import type { User } from '../../../domain/entities/User';
import type { HttpRequest, HttpResponse } from '../types';
import { requireUser } from './requireUser';

export type UserControllerDeps = {
    createUser: CreateUser;
    authenticateUser: AuthenticateUser;
    getUser: GetUser;
    banUser: BanUser;
    /** Request-scoped value: the authenticated user id, or null for anonymous requests. */
    currentUserId: string | null;
};

/** The HTTP projection of a user: what the API shows is a decision of the API. */
function toUserView(user: User) {
    return {
        id: user.id,
        name: user.name,
        displayName: user.displayName,
        roles: user.roles,
        banned: user.ban !== null,
    };
}

/**
 * A controller translates HTTP into use-case calls and back — nothing else.
 * No rule, no repository, no `if (user.roles…)`: those live below.
 */
export class UserController {
    private readonly deps: UserControllerDeps;

    constructor({
        createUser,
        authenticateUser,
        getUser,
        banUser,
        currentUserId,
    }: UserControllerDeps) {
        this.deps = { createUser, authenticateUser, getUser, banUser, currentUserId };
    }

    async register(request: HttpRequest): Promise<HttpResponse> {
        const user = await this.deps.createUser.execute(CreateUserDtoSchema.parse(request.body));
        return { status: 201, body: toUserView(user) };
    }

    async login(request: HttpRequest): Promise<HttpResponse> {
        const { user, token } = await this.deps.authenticateUser.execute(
            AuthenticateDtoSchema.parse(request.body)
        );
        return { status: 200, body: { token, user: toUserView(user) } };
    }

    async me(): Promise<HttpResponse> {
        const user = await this.deps.getUser.execute(requireUser(this.deps.currentUserId));
        return { status: 200, body: toUserView(user) };
    }

    async ban(request: HttpRequest): Promise<HttpResponse> {
        const actorId = requireUser(this.deps.currentUserId);
        const targetId = request.params.id ?? '';
        const banned = await this.deps.banUser.execute(
            actorId,
            targetId,
            BanUserDtoSchema.parse(request.body)
        );
        return { status: 200, body: toUserView(banned) };
    }
}
