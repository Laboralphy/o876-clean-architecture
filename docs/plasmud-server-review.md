# Clean architecture with Awilix — review of plasmud-server

Scope: `plasmud-server/packages/server/src/{domain,application,infrastructure,boot}`,
read on 2026-10-05. The template in this repository (`src/`, `tests/`) applies the
recommendations below. Section 7 maps it back to plasmud, and
[ARCHITECTURE.md](ARCHITECTURE.md) is the generic guide for adopting it.

---

## 1. Verdict

**Yes, the architecture is sound and worth reusing.** The central idea is the right one:
use cases that depend only on interfaces (ports), one composition root that binds real
implementations, and a DI container that keeps that binding out of the business code.
This is Ports & Adapters (hexagonal architecture) under another name. It is not a fashion
choice. Plasmud has already used it in practice, as the next section shows.

The rule "use cases only see interfaces" is currently **kept by discipline, not enforced
by the compiler**. A few leaks (section 4) mean a careless edit could break it without
any error. Before turning this into a template for other projects, close those leaks.
The fixes are all small and type-level. None of them changes the overall shape.

---

## 2. What the architecture is today

| Layer | Contents | Size |
|---|---|---|
| `domain/` | Zod schemas + inferred types (`User`, `Ban`, `MailMessage`…), enums, repository ports, `IDatabaseAdapter`, `IBattleSystem` | ~30 files |
| `application/` | 26 use cases (one class, one `execute`), 13 service ports, DTOs (Zod) | ~50 files |
| `infrastructure/` | JSON-db repositories, services (encryptor, script runners, game service, battle systems…), Telnet controller, Koa admin API, CLI (talks to the API over HTTP) | ~80 files |
| `boot/container.ts` | `interface Cradle` (~60 entries) + `container.register({...})`, a per-client scope, config-driven adapter selection | 378 lines |

How it runs:

- **Awilix in PROXY mode.** Every constructor receives the cradle (a lazy proxy) and
  picks what it needs. No decorators, no `reflect-metadata`, and it survives bundling.
- **Singletons** for use cases, repositories and services.
- **One scope per telnet client** (`createClientContainer(idClient)`). Context services
  (`ctx.mail`, `ctx.chat`…) and the `TelnetClientController` are `scoped()`, so each
  connection gets its own instances, all bound to its `idClient`.
- **Adapters chosen by configuration:** `selectScriptRunner` (SES vs VM2) and
  `registerBattleSystem()` (RBS vs FFBS).

---

## 3. What is good (keep it)

1. **The adapters are actually swappable, and it has been done.** SES and VM2 implement
   `IScriptRunner`. RBS and FFBS implement `IBattleSystem`, are chosen from
   `server-config.yaml`, and no use case knows which one is running. Telnet, the Koa
   admin API and the CLI all drive the same use cases. This is the payoff clean
   architecture promises, and plasmud gets it.
2. **Use cases named by intent.** `BanUser`, `SendMail`, `AuthenticateUser`,
   `DeclareAlias`: listing `application/use-cases/` tells you what the server does
   ("screaming architecture"). One class with one `execute` is a convention that stays
   readable as the number of use cases grows.
3. **Small, consumer-shaped ports.** `ITime.now()`, `IIdGenerator`, `IEncryptor`. Time
   and ids are injected, so tests are deterministic. Most code bases skip this and pay
   for it later.
4. **The per-connection scope fits a MUD well.** One child container per client, with
   `idClient` as a scoped value, gives every script context its own services without
   threading the client id through every call.
5. **Zod as the entity language.** One declaration gives both the static type and the
   runtime validator. Repositories re-`parse` what they read, so the storage is treated
   as an untrusted boundary, which is correct.
6. **Credentials stored apart** (`UserSecret` separate from `User`). "List users" cannot
   leak password hashes by accident.
7. **PROXY injection keeps tests light.** A test registers only the 5–6 dependencies the
   use case reads, because the proxy resolves lazily.

---

## 4. Weaknesses: where "only interfaces" is not enforced

### 4.1 The application layer imports the composition root

25 files in `application/` do `import { Cradle } from '../../../boot/container'`. The
import is type-only, so it costs nothing at runtime. At compile time, though, it creates
a cycle: **application → boot → infrastructure → application**. `Cradle` contains
concrete types (`BehaviorService`, `ItemEventsNotifier`, `CombatEventBus`,
`TelnetClientController`, `AbstractContextService`…). The consequences:

- A use case can write `cradle.behaviorService.something()` and get a **concrete
  infrastructure class**. The compiler accepts it. Interface-only access is a habit, not
  a rule.
- `application/` cannot be moved into its own package (`@plasmud/application`), or
  compiled and tested without `infrastructure/`.
- A use case's constructor signature does not tell you its dependencies. You have to read
  the body.

**Fix:** each class declares what it consumes:

```ts
export type BanUserDeps = {
    userRepository: IUserRepository;
    sessionRegistry: ISessionRegistry;
    notifier: INotifier;
    clock: IClock;
};
export class BanUser {
    constructor({ userRepository, sessionRegistry, notifier, clock }: BanUserDeps) { … }
}
```

Only the composition root knows the `Cradle`. It checks that the Cradle satisfies every
`XxxDeps` (see 4.4). The use case no longer depends on Awilix in any way. Awilix becomes
one implementation detail of `boot/`, and you could replace it with a hand-written
composition root (`new BanUser({ userRepository, … })`) without touching
`application/`.

### 4.2 A port defined in terms of adapters

`application/ports/classes/IClientContextServices.ts` imports **eight concrete classes**
from `infrastructure/services/context-services/`. A port that names its adapters is not
a port. Either give each context service an interface, or (simpler, and honest) move the
file to `infrastructure/`, since only infrastructure (the script context) consumes it.

### 4.3 Persistence vocabulary in the domain

`domain/ports/adapters/IDatabaseAdapter.ts` talks about tables, keys, `JsonObject` and
`DatabaseInitOptions { host, port, user, password }`. No use case uses it. Only the
repository implementations do. It is a contract **between two infrastructure classes**,
so it belongs in `infrastructure/persistence/`. The domain should know repositories
(`IUserRepository.findByName`), not tables. The example has it as
`infrastructure/persistence/IDocumentStore.ts`.

### 4.4 `Cradle` and `register()` can drift apart silently

The interface is written once and the registrations a second time, and nothing checks
that they match:

- Declaring `foo: IFoo` in `Cradle` and forgetting to register it compiles. It fails at
  runtime on the first `resolve`, possibly deep in a player's session.
- Awilix's `asClass` takes `Constructor<T> = new (...args: any[]) => T`. It **never
  looks at constructor parameters**, so it cannot detect that a class needs a dependency
  the cradle lacks.
- `registerBattleSystem()` registers two Cradle entries after the fact, so "is
  everything registered?" can only be answered at runtime.

**Fix:** two lines of types in the composition root (`src/boot/container.ts`):

```ts
type Registrations<C> = { [K in keyof C]: Resolver<C[K]> };
const singleton = <T>(cls: new (cradle: Cradle) => T) => asClass(cls).singleton();

const registrations: Registrations<Cradle> = {
    clock: singleton(SystemClock),
    banUser: singleton(BanUser),
    …
};
```

I verified that each of these mistakes becomes a `tsc` error:

| Mistake | Error |
|---|---|
| A Cradle key with no registration | `Property 'notifier' is missing in type …` |
| Binding a class that doesn't implement the port | `… is not assignable to type 'Resolver<IClock>'` |
| A class whose `Deps` asks for something the Cradle lacks | `Argument of type 'typeof X' is not assignable to parameter of type 'new (cradle: Cradle) => X'` |

The last check works through parameter contravariance. `new (deps: BanUserDeps) => …`
is assignable to `new (cradle: Cradle) => …` only if `Cradle` is assignable to
`BanUserDeps`.

### 4.5 No strict mode while mixing singletons and scoped services

Singletons and `scoped()` registrations share one container, and the container is not
created with `strict: true`. Today nothing prevents a singleton from depending on a
client-scoped context service. Awilix would build it once, with the **first client's**
instance, and every other player would silently share it. `createContainer({ strict:
true })` turns that into an `AwilixResolutionError: … has a shorter lifetime than its
ancestor`. The example has a test for exactly this.

> Related subtlety: under strict mode, a constructor should *destructure* the cradle
> (as plasmud already does) rather than store the proxy and read it later. Lifetime
> checks only see dependencies that are resolved during construction.

### 4.6 Error codes hidden in message strings

```ts
throw new Error(USE_CASE_ERRORS.ENTITY_NOT_FOUND + ` User : ${idUser}`);
```

The code exists but is not machine-readable, and **no adapter reads it**. As a result,
the admin API returns 400 (routes behind `validate`, whose catch-all wraps the
controller) or 500 (the others) for "user not found". A typed `DomainError` with a
`code` field, plus one table per adapter (`NOT_FOUND → 404` for HTTP, `NOT_FOUND →
an i18n key` for telnet), fixes this in one place each. See
`src/domain/errors.ts` and `src/infrastructure/http/HttpServer.ts`.

### 4.7 Smaller points

- **Anemic entities.** The rules live in use cases: `BanUser` builds the ban object, and
  `CreateUser` checks reserved names. That is acceptable here, because the rich domain of
  plasmud is in `@plasmud/engine`, and the server's own domain is mostly accounts.
  Still, pure functions next to the schemas (`isBanned(user, now)`,
  `canBan(actor, target)`, `withBan(user, …)`) can be tested without a single mock. See
  `src/domain/entities/User.ts`.
- **Ports that mix concerns.** `ITime` combines a clock (`now`) with presentation
  (`renderDate`, `renderDuration`). The use cases need the clock, and formatting belongs
  to the adapters that print. `ICommunicationLayer` has 8 methods, while each use case
  uses 2–3 of them. Narrower ports are easier to fake.
- **Use cases calling use cases.** `BanUser` and `SendMail` call `SendClientMessage` and
  `DestroyClient`. That is fine at this size. If it grows, those callees are really
  application services (or ports, such as `INotifier`) rather than entry points, and
  treating them as such avoids cycles between use cases.
- **Untyped test containers.** 6 test files use `AwilixContainer<any>` with
  `asValue({...})` partial fakes. When a port changes, those fakes keep compiling and
  drift. Once a use case takes a plain `Deps` object, tests can just do
  `new CreateUser(deps)` with fakes typed `implements IClock` and similar. The container
  then needs a single smoke test that resolves every registration.
- **Boilerplate per use case:** the class, a `Cradle` line and a `register` line. Keep it
  explicit (`loadModules` auto-registration loses all typing). With `Registrations<Cradle>`,
  the compiler at least points out the line you forgot.

---

## 5. Bugs found while reading (not architectural, but worth fixing)

1. **Anyone can disconnect a logged-in player.** In
   `AuthenticateUser.ts:41`, the existing client is dropped *before* the password is
   checked (line 47). Attempting to log in as someone with any password kicks them.
   Verify the password first, then replace the session. (The doc comment, line 14, also
   promises "null returned after a delay". The code throws and has no delay.)
2. **Password storage.** `Encryptor.ts:6` uses unsalted SHA-256 and the comparison is a
   plain `!==`. Identical passwords give identical hashes, and SHA-256 is fast enough to
   brute-force. Use scrypt (built into `node:crypto`) or argon2 with a random salt, plus
   `timingSafeEqual`. **The port itself must change:** `encryptPassword(p): string`
   cannot express salted hashing. You need `hash(p)` and `verify(p, hash)`, both async.
   Existing hashes can be migrated on next login (recognise the old format, re-hash).
   See `src/infrastructure/services/ScryptPasswordHasher.ts`.
3. **Orphan secrets.** `CreateUser.ts:71` saves the `UserSecret` before the uniqueness
   checks on lines 72–86. Every rejected registration leaves a secret behind. Validate
   everything first, then write.

---

## 6. Reusing it as a template: checklist

**Keep** from plasmud:
- the 4 folders `domain / application / infrastructure / boot`
- one use case = one class with `execute`, named by intent
- Awilix PROXY mode, singletons by default, child scopes for per-connection or
  per-request state
- Zod schemas as entities and DTOs, and re-validation on read
- config-driven adapter selection in the composition root

**Change** for the template:
- [ ] Each class exports `XxxDeps`. Nothing outside `boot/` imports `Cradle`.
- [ ] `Registrations<Cradle>` + typed `singleton()` / `scoped()` helpers.
- [ ] `createContainer({ injectionMode: PROXY, strict: true })`.
- [ ] Constructors destructure their dependencies (no stored cradle proxy).
- [ ] `DomainError { code }`, mapped once per delivery adapter.
- [ ] Ports only in `domain/` or `application/`. Contracts used only between adapters live in
      `infrastructure/`.
- [ ] Domain rules as pure functions next to the schemas.
- [ ] Use-case tests construct the class directly with typed fakes. One container smoke
      test resolves every registration.
- [ ] Enforce the import boundaries. The template does it with
      `tests/architecture.test.ts`, which has no dependencies. Plasmud already uses an
      ESLint rule for battle-system barrels, and `no-restricted-imports` can guard the
      layers the same way.
- [ ] Turn on `verbatimModuleSyntax`. It forces `import type` for ports, which makes
      "application only uses types from ports" visible on every import line.

**When not to use it.** For a small CRUD service with a single adapter of each kind, the
cost (3 files and 2 registry lines per feature) outweighs the benefit. The architecture
pays off once you have several delivery mechanisms (telnet + HTTP + CLI) or several
interchangeable implementations (SES/VM2, RBS/FFBS, memory/JSON/SQL), which is
plasmud's situation.

---

## 7. The template in this repository

A small slice of plasmud: accounts, login sessions, bans and mail, served over HTTP.

```
src/
  domain/
    entities/User.ts          schema + pure rules (isBanned, canBan, withBan)
    entities/UserSecret.ts    credentials kept apart (as in plasmud)
    entities/MailMessage.ts
    errors.ts                 DomainError { code }                      ← 4.6
    ports/repositories.ts     IUserRepository, IMailRepository, …
  application/
    ports/services.ts         IClock, IPasswordHasher(hash/verify), ISessionRegistry, INotifier…
    dto/                      Zod input contracts
    use-cases/users/          CreateUser, AuthenticateUser, BanUser, GetUser   (each exports XxxDeps ← 4.1)
    use-cases/mail/           SendMail, ReadInbox
  infrastructure/
    persistence/IDocumentStore.ts   infra-internal contract                   ← 4.3
    persistence/Memory…/JsonFile…   two stores, picked by config (STORAGE=memory|json)
    persistence/repositories.ts     repositories over the store, re-parse on read
    services/                 scrypt hasher ← 5.2, session registry, console notifier, clock, uuid
    http/                     node:http server, routes, controllers (request-scoped)
  boot/
    container.ts              Cradle, RequestCradle, Registrations<…>, strict mode  ← 4.4, 4.5
    settings.ts               the only reader of process.env
  main.ts
tests/
  architecture.test.ts        layer import rules                                  ← 4.1–4.3
  users.test.ts               use cases with typed fakes, no container
  container.test.ts           resolves everything, strict-mode lifetime leak test
  http.e2e.test.ts            real container + real HTTP
```

| plasmud | example |
|---|---|
| `Cradle` imported by use cases | `XxxDeps` per class, `Cradle` private to `boot/` |
| `ClientCradle` + `idClient` | `RequestCradle` + `currentUserId` (`createRequestScope`) |
| `selectScriptRunner`, `registerBattleSystem` | `selectDocumentStore` (memory / JSON file) |
| `IDatabaseAdapter` in `domain/` | `IDocumentStore` in `infrastructure/persistence/` |
| `USE_CASE_ERRORS.X + ' msg'` | `DomainError` + `STATUS_BY_CODE` in the HTTP adapter |
| `IEncryptor.encryptPassword` (SHA-256) | `IPasswordHasher.hash/verify` (scrypt + salt) |
| `CommunicationLayer` | `InMemorySessionRegistry` |
| `AwilixContainer<any>` in tests | `new BanUser(deps)` with fakes that `implements` the ports |

Run it:

```bash
npm install
npm test                       # architecture, unit, container, HTTP end-to-end
npm run typecheck
npm start                      # PORT=8080 STORAGE=memory ADMIN_NAMES=ralphy
STORAGE=json npm start         # persists to ./data/*.json
```

```bash
curl -XPOST localhost:8080/users    -d '{"name":"ralphy","displayName":"Ralphy","email":"r@x.io","password":"long-enough"}'
curl -XPOST localhost:8080/sessions -d '{"name":"ralphy","password":"long-enough"}'   # → {"token": …}
curl localhost:8080/me -H "authorization: Bearer <token>"
```

**Adding a use case** (e.g. `UnbanUser`):

1. `application/use-cases/users/UnbanUser.ts`: `export type UnbanUserDeps = {…}`, plus the class.
2. `boot/container.ts`: add `unbanUser: UnbanUser` to `Cradle`. The compiler then asks for
   `unbanUser: singleton(UnbanUser)` in `registrations` and checks its deps.
3. Call it from a controller and add a route.
