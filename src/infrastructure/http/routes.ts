import type { Route } from './types';

export const routes: Route[] = [
    { method: 'POST', path: '/users', handle: (s, r) => s.userController.register(r) },
    { method: 'POST', path: '/sessions', handle: (s, r) => s.userController.login(r) },
    { method: 'GET', path: '/me', handle: (s) => s.userController.me() },
    { method: 'PUT', path: '/users/:id/ban', handle: (s, r) => s.userController.ban(r) },
    { method: 'POST', path: '/mail', handle: (s, r) => s.mailController.send(r) },
    { method: 'GET', path: '/mail', handle: (s) => s.mailController.inbox() },
];
