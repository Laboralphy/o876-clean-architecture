import http from 'node:http';
import { ZodError } from 'zod';
import { DomainError, type ErrorCode } from '../../domain/errors';
import type { HttpRequest, HttpResponse, HttpScope, Route } from './types';

/**
 * The one place where domain error codes become HTTP statuses.
 * Another adapter (CLI, WebSocket…) would have its own table for the same codes.
 */
const STATUS_BY_CODE: Record<ErrorCode, number> = {
    NOT_FOUND: 404,
    ALREADY_EXISTS: 409,
    RESERVED: 409,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    INVALID: 422,
};

export function toErrorResponse(error: unknown): HttpResponse {
    if (error instanceof DomainError) {
        return {
            status: STATUS_BY_CODE[error.code],
            body: { error: error.code, message: error.message },
        };
    }
    if (error instanceof ZodError) {
        return { status: 422, body: { error: 'INVALID', issues: error.issues } };
    }
    console.error(error);
    return { status: 500, body: { error: 'INTERNAL' } };
}

function matchRoute(routes: Route[], method: string, path: string) {
    const segments = path.split('/').filter(Boolean);
    for (const route of routes) {
        const pattern = route.path.split('/').filter(Boolean);
        if (route.method !== method || pattern.length !== segments.length) {
            continue;
        }
        const params: Record<string, string> = {};
        const matches = pattern.every((part, i) => {
            const segment = segments[i] ?? '';
            if (part.startsWith(':')) {
                params[part.slice(1)] = decodeURIComponent(segment);
                return true;
            }
            return part === segment;
        });
        if (matches) {
            return { route, params };
        }
    }
    return undefined;
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    return text ? JSON.parse(text) : undefined;
}

export type RequestScope = { cradle: HttpScope; dispose(): Promise<void> | void };

export type HttpServerOptions = {
    routes: Route[];
    /**
     * Supplied by the composition root: builds a DI scope for one request (from the
     * bearer token). This is how infrastructure gets per-request objects without
     * importing the container.
     */
    createScope: (bearerToken: string | undefined) => RequestScope;
};

export function createHttpServer({ routes, createScope }: HttpServerOptions): http.Server {
    return http.createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const found = matchRoute(routes, req.method ?? 'GET', url.pathname);
        let response: HttpResponse;
        if (!found) {
            response = { status: 404, body: { error: 'NO_ROUTE' } };
        } else {
            const authorization = req.headers.authorization;
            const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
            const scope = createScope(token);
            try {
                const request: HttpRequest = {
                    method: req.method ?? 'GET',
                    path: url.pathname,
                    params: found.params,
                    headers: req.headers as Record<string, string | undefined>,
                    body: await readJson(req),
                };
                response = await found.route.handle(scope.cradle, request);
            } catch (error) {
                response = toErrorResponse(error);
            } finally {
                await scope.dispose();
            }
        }
        res.writeHead(response.status, { 'content-type': 'application/json' });
        res.end(response.body === undefined ? '' : JSON.stringify(response.body));
    });
}
