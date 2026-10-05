# Architecture guide

This repository is a **reference template** for TypeScript back-ends built with clean
architecture (ports & adapters) and [Awilix](https://github.com/jeffijoe/awilix) for
dependency injection. The business example (accounts, sessions, bans, mail) is
deliberately small. Copy the structure and the rules, not the features.

---

## 1. The idea

```
                ┌──────────────────────────────────────────────┐
                │ boot/  composition root                      │
                │ the only code that knows every layer & Awilix│
                └───────┬──────────────┬───────────────┬───────┘
                        │ builds       │ builds        │ builds
                        ▼              ▼               ▼
  ┌──────────────────────────┐   ┌───────────────┐   ┌──────────┐
  │ infrastructure/          │──▶│ application/  │──▶│ domain/  │
  │ adapters: HTTP, storage, │   │ use cases     │   │ entities │
  │ crypto, notifications…   │   │ + ports       │   │ + rules  │
  └──────────────────────────┘   └───────────────┘   └──────────┘
        implements ports ─────────────▲    imports only ports & entities
```

- **Dependencies point inwards.** The domain knows nothing. The application knows the
  domain. Infrastructure knows both. `boot/` knows everything.
- **Use cases only see interfaces (ports).** They never know whether users live in
  memory, in a JSON file or in Postgres, or whether a call came from HTTP, a CLI or a
  socket.
- **The composition root picks the implementations.** Swapping one is a single line in
  `src/boot/container.ts`, or a configuration value.

---

## 2. The rules, and what enforces them

| Rule | Enforced by |
|---|---|
| `domain` imports only `domain` (and `zod`) | `tests/architecture.test.ts` |
| `application` imports only `domain` + `application` (and `zod`). No I/O, no Awilix | `tests/architecture.test.ts` |
| `infrastructure` never imports `boot` | `tests/architecture.test.ts` |
| A class's dependencies are declared by the class itself (`XxxDeps`) | convention, made safe by the next row |
| The container provides every dependency of every class, with the right type | `tsc` (typed `singleton()` / `scoped()` helpers) |
| Every `Cradle` entry is registered, with a class implementing its port | `tsc` (`Registrations<Cradle>`) |
| A singleton never captures request-scoped state | Awilix `strict: true` + `tests/container.test.ts` |
| Ports are imported as types only | `verbatimModuleSyntax` (forces `import type`) |

To allow a new package in a layer, edit `RULES` in `tests/architecture.test.ts`. Doing
it there is a deliberate, reviewable decision.

---

## 3. Map of the code

```
src/
  domain/
    entities/            Zod schema + inferred type + pure rule functions
    errors.ts            DomainError { code }: the only error use cases throw on purpose
    schemas.ts           shared value schemas (ids, names, e-mail…)
    ports/               repository interfaces, in domain vocabulary
  application/
    ports/               service interfaces the use cases need (clock, hasher, notifier…)
    dto/                 Zod input contracts of the use cases
    use-cases/<area>/    one class per user intention, one `execute()` method
  infrastructure/
    persistence/         repository implementations + the store they share
    services/            port implementations (crypto, clock, ids, sessions…)
    http/                delivery adapter: server, routes, controllers
  boot/
    settings.ts          the only reader of process.env
    container.ts         Cradle, registrations, scopes, adapter selection
  main.ts                build the container, start the adapters
tests/
  architecture.test.ts   the dependency rule
  container.test.ts      the wiring resolves, lifetimes are valid
  users.test.ts          use cases with typed fakes (no container)
  http.e2e.test.ts       real container + real HTTP
```

---

## 4. Conventions

**Use cases**

```ts
export type BanUserDeps = {                       // 1. declare what you consume, as ports
    userRepository: IUserRepository;
    clock: IClock;
};

export class BanUser {
    private readonly deps: BanUserDeps;

    constructor({ userRepository, clock }: BanUserDeps) {   // 2. destructure now
        this.deps = { userRepository, clock };
    }

    async execute(actorId: string, targetId: string, dto: BanUserDto): Promise<User> { … }
}
```

1. **Never import `Cradle` outside `boot/`.** The use case states its needs, and the
   container proves it can meet them.
2. **Destructure in the constructor.** In Awilix PROXY mode the argument is a lazy proxy.
   Reading it at construction makes a missing dependency or a lifetime leak fail
   immediately, under strict mode, instead of at the first call.
3. **The acting user is an argument** (`actorId`), not ambient state. Authorization
   rules then show in the signature, and use cases stay singletons.
4. **Validate everything before the first write.** A rejected request must leave
   nothing behind.

**Domain.** Entities are Zod schemas. Rules are pure functions next to them
(`isBanned(user, now)`, `canBan(actor, target)`), with time passed in as a parameter.
They need neither fakes nor a container to test.

**Errors.** Throw `DomainError` with a `code`. Each delivery adapter maps codes once
(`STATUS_BY_CODE` in `infrastructure/http/HttpServer.ts`). Never put the code inside the
message string.

**Ports.**
- **Shape ports for their consumer, and keep them narrow.** If two use cases need
  different halves of a port, split it.
- **Mind where they live.** Repository ports go in `domain/ports`, service ports in
  `application/ports`. A contract used only *between* adapters, such as
  `IDocumentStore`, stays in `infrastructure/`.

**Input and output.** Adapters parse their payloads into application DTOs (Zod). What
goes back out is a *view* built by the adapter (`toUserView`). Never return entities
verbatim, or fields such as e-mail addresses leak.

**Configuration.** Only `boot/settings.ts` reads `process.env`. The rest receive values
through the container (`IAppConfig`, `asValue(...)`).

---

## 5. Recipes

### Add a use case

1. Create `src/application/use-cases/<area>/DoThing.ts` with `DoThingDeps` and the class.
2. In `src/boot/container.ts`, add `doThing: DoThing` to `Cradle`. `tsc` then reports
   the missing registration. Add `doThing: singleton(DoThing)`, and `tsc` checks that
   every entry of `DoThingDeps` exists in the `Cradle` with a compatible type.
3. Expose it: add it to a controller's `Deps` and a route in
   `src/infrastructure/http/routes.ts`.
4. Test it: `new DoThing(makeDeps())` in `tests/`.

### Add a port and its adapter

1. Declare the interface in `application/ports` (or `domain/ports` for a repository).
2. Implement it in `infrastructure/` (`class SmtpNotifier implements INotifier`). If it
   needs configuration, give it a `Deps` type too.
3. Register it in `Registrations<Cradle>`. `tsc` rejects a class that doesn't implement
   the port.
4. Add a fake that `implements` the port in `tests/helpers/fakes.ts`.

### Choose an adapter by configuration

See `selectDocumentStore` in `boot/container.ts`: a function registered with
`asFunction(...).singleton()` returns one implementation or another, typed as the port.
`STORAGE=memory|json` switches persistence without any use case noticing.

### Add a delivery mechanism (CLI, WebSocket, queue consumer…)

Create `infrastructure/<mechanism>/` with controllers (or handlers) that depend on use
cases through their own `Deps`. Start the mechanism in `main.ts` (or a second entry
point, such as `cli.ts`) from the same container. The use cases don't change.

### Per-request or per-connection state

`createRequestScope()` creates a child container and registers values that exist only
for that request (`currentUserId`). Classes that need them are registered with
`scoped(...)`. For a socket server, do the same per connection and dispose the scope
when it closes. Strict mode guarantees that no singleton captures these values.

---

## 6. Testing strategy

| Level | What | How |
|---|---|---|
| Domain rules | pure functions | plain values |
| Use cases | business behaviour | `new UseCase(deps)` with real in-memory repositories and typed fakes (`FakeClock`, `PlainHasher`, `RecordingNotifier`). No container. |
| Wiring | the container resolves, lifetimes hold | `tests/container.test.ts` resolves every registration |
| Adapters end to end | HTTP ↔ use cases ↔ storage | `tests/http.e2e.test.ts`: real container on a random port |
| Architecture | the dependency rule | `tests/architecture.test.ts` |

Fakes `implements` their port, so changing a port breaks the fakes at compile time
instead of leaving them silently out of date.

---

## 7. Starting a new project from this template

1. Copy the repository, then change `name` in `package.json`.
2. Keep `boot/`, `domain/errors.ts`, `infrastructure/http/HttpServer.ts`,
   `infrastructure/persistence/*Store*`, the services you need, and all of `tests/`
   except the example's business tests.
3. Replace the example's entities, ports, use cases, controllers and routes with yours,
   one use case at a time, following section 5. `tsc` and the architecture test guide
   each step.
4. Replace `MemoryDocumentStore`/`JsonFileDocumentStore` with your real database adapter
   when you need one. Repositories built on `IDocumentStore` keep working, or write
   dedicated repositories against the database.

---

## 8. When *not* to use this

The cost is real: about 3 files and 2 registry lines per feature. For a small CRUD
service with a single adapter of each kind and a short life expectancy, a plain layered
app is cheaper. The architecture pays off once you have **several delivery mechanisms**
(HTTP + CLI + sockets), **several interchangeable implementations** (storage engines,
sandboxes, rule sets), or business rules you want to test without I/O.

---

## 9. FAQ

**Why Awilix?** PROXY injection needs no decorators and no `reflect-metadata`, and
works with plain classes. Because classes declare plain `Deps` types and never import
Awilix, it is replaceable. `boot/container.ts` could be rewritten as a hand-written
composition root (`new BanUser({ userRepository, … })`) without touching any other
layer.

**Why not `loadModules()` auto-registration?** It removes the `Registrations<Cradle>`
typing, which is what turns wiring mistakes into compile errors. The explicit list
doubles as documentation.

**Why Zod in the domain?** It serves as a type language: one declaration gives the
static type and the runtime validator. It has no I/O. Repositories re-parse what they
read, because storage is an untrusted boundary.
