import { buildContainer, createRequestScope } from './boot/container';
import { readSettings } from './boot/settings';
import { createHttpServer } from './infrastructure/http/HttpServer';
import { routes } from './infrastructure/http/routes';

const settings = readSettings();
const container = buildContainer(settings);

await container.resolve('documentStore').init();

const server = createHttpServer({
    routes,
    createScope: (token) => createRequestScope(container, token),
});
server.listen(settings.port, () => {
    console.log(`listening on http://localhost:${settings.port} (storage: ${settings.storage})`);
});

process.on('SIGINT', () => {
    server.close();
    void container.dispose();
});
