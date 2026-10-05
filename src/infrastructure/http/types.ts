import type { UserController } from './controllers/UserController';
import type { MailController } from './controllers/MailController';

export type HttpRequest = {
    method: string;
    path: string;
    params: Record<string, string>;
    headers: Record<string, string | undefined>;
    body: unknown;
};

export type HttpResponse = {
    status: number;
    body?: unknown;
};

/**
 * What the HTTP adapter needs from a request scope. Declared here, satisfied by the
 * container's RequestCradle (boot/container.ts) — so infrastructure never imports boot.
 */
export type HttpScope = {
    userController: UserController;
    mailController: MailController;
};

export type Route = {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    handle: (scope: HttpScope, request: HttpRequest) => Promise<HttpResponse>;
};
