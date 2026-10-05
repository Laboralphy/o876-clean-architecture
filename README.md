# Clean architecture template — TypeScript + Awilix

A reference project for back-ends built with **clean architecture** (ports & adapters)
and **Awilix** dependency injection. Use cases depend only on interfaces. One
composition root binds the real implementations. The rules are **enforced** by the
compiler and the test suite, not just documented.

```
domain  ←  application  ←  infrastructure
   ↖___________↖_______________↖___  boot (composition root)
```

The example domain is small on purpose: accounts, login sessions, bans and mail, served
over HTTP, with storage that switches between memory and JSON files.

## Quick start

```bash
npm install
npm test            # architecture rules, use cases, container wiring, HTTP end-to-end
npm run typecheck
npm start           # http://localhost:8080   (PORT, STORAGE=memory|json, ADMIN_NAMES)
```

```bash
curl -XPOST localhost:8080/users    -d '{"name":"ralphy","displayName":"Ralphy","email":"r@x.io","password":"long-enough"}'
curl -XPOST localhost:8080/sessions -d '{"name":"ralphy","password":"long-enough"}'    # → {"token": …}
curl localhost:8080/me -H "authorization: Bearer <token>"
```

## What makes it safe to grow

| Guarantee | Where |
|---|---|
| Layers only import inwards, and the application never sees Awilix | `tests/architecture.test.ts` |
| Every class's dependencies exist in the container, with the right type | `tsc`, via `singleton()`/`scoped()` in `src/boot/container.ts` |
| Every container entry is registered with a class implementing its port | `tsc`, via `Registrations<Cradle>` |
| No singleton captures per-request state | Awilix `strict: true`, `tests/container.test.ts` |

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**: the guide. Rules, conventions,
  recipes (add a use case, a port, an adapter, a delivery mechanism), testing strategy,
  and how to start a new project from this template.
- [docs/plasmud-server-review.md](docs/plasmud-server-review.md): the review of the
  project this template was extracted from, and why each rule exists.
