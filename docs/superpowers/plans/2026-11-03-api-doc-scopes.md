# Registry API doc with OAuth scopes: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registry accepts read-only `registry` scoped sessions on its catalog-browsing routes, and serves an
OpenAPI 3.1 document that data-fair can merge into the platform doc and that openapi-mcp turns into two agent
tools.

**Architecture:** This copies the metrics service (`~/data-fair/metrics`: `api/src/scopes.ts`,
`api/contract/api-docs.ts`, `test-it/03-agent-api-docs.ts`, `test-it/05-scopes.ts`, `test-it/utils/nhi.ts`).
A `scopedOperations` table in `api/src/scopes.ts` drives two things: the route guards
(`requireOperationScope`) and the security of the operations in the doc. lib-express (scope-aware session)
refuses scoped sessions on every other route.

**Tech Stack:** Express, `@data-fair/lib-express` 2.0 (`requireScope`, `session.init(..., { scopeAware: true })`),
`@data-fair/lib-common-types` `scopes.js`, `@data-fair/openapi-mcp` ^0.7.0 (dev), `jose` (dev), Playwright
api tests.

**Spec:** `docs/superpowers/specs/2026-11-03-api-doc-scopes-design.md`

## Global Constraints

- Scope family `registry`, tiers `['read']` only.
- Security scheme names and definitions, exactly:
  - `sdCookie`: `{ type: 'apiKey', in: 'cookie', name: 'id_token' }`
  - `oauth2`: `oauth2SecurityScheme(vocabulary, { directoryUrl: '/simple-directory', locale })`
  - registry's own key: `registryApiKey`: `{ type: 'apiKey', in: 'header', name: 'x-api-key' }`. Never name
    it `apiKey`.
- Browsing operation security: `[{ sdCookie: [] }, ...oauth2Alternatives(acceptedScopes('registry', 'read'))]`.
- `x-agent` keys only from: `name`, `title`, `description`, `examples`, `annotations`, `params`, `fixed`,
  `body`, `bodyFields`, `bodyRequired`, `response`, `editor`, `security`.
- Doc served at `GET /api/v1/api-docs.json`:
  - public;
  - `Cache-Control: public, max-age=300`;
  - `Vary: Accept-Language`;
  - locale `en` when `req.acceptsLanguages('fr', 'en') === 'en'`, else `fr`;
  - `openapi: '3.1.0'`;
  - `servers: [{ url: '/registry/api/v1' }]`, paths relative to it.
- Agent tools: exactly `search_artefacts` (list route) and `get_artefact` (detail route).
- A scoped session is never admin.
- Never start or stop the dev env, `npm install` or `docker compose` anything yourself (AGENTS.md): ask the
  user.
- Logging, lint and typing rules from AGENTS.md apply. Run `npm run lint-fix` and `npm run check-types`
  before each commit.

## Review Focus

1. **A scoped token of a superadmin user** must not be treated as admin: no `scan` field, no admin sort.
   Task 1 tests the output for a scoped session. The test NHI is not a superadmin, so the
   `adminMode && !scopes` branch itself is checked in review.
2. **A `registry:read` session asking for a private artefact the account cannot see** gets 404, exactly like
   the same account's unscoped session: scopes never widen access. Test in Task 1.
3. **A `registry:read` session on a non-catalog route that reads the session** (`GET /api/v1/access-grants/me`,
   `GET /api/v1/api-keys`, `PATCH /api/v1/artefacts/:id`) gets 403, not 401 or 500. Test in Task 1.
4. **Read API key and internal-secret callers** of the guarded routes are unaffected by the new guard, since
   they have no session. Run the existing suites in Task 1, step 6.
5. **`Accept-Language: de` or a missing header** serves the `fr` document, and `en` serves English scope
   descriptions. Test in Task 2.

---

### Task 1: Scope-aware session and guarded catalog routes

**Files:**
- Modify: `api/package.json` (add `@data-fair/lib-common-types`, the same range as the root lock resolves,
  ^1.27.0)
- Modify: `package.json` (devDependencies `@data-fair/openapi-mcp` ^0.7.0, `jose`, the same major as metrics)
- Modify: `docker-compose.yml` (simple-directory env `MANAGE_NHIS=true`, `NHIS_ALLOW_INSECURE_ISSUERS=true`,
  with a comment naming the scope tests)
- Modify: `dev/resources/users.json`: add an NHI user `test1_scope_nhi`, email `test1_scope_nhi@test.com`, with:
  - `nhi.provider.issuer: "https://registry-tests.example.com"`;
  - `nhi.provider.jwks`: the content of `~/data-fair/metrics/test-it/resources/nhi/test-nhi-jwks.json`;
  - `nhi.subject: "scope-tests"`.
- Modify: `dev/resources/organizations.json`: add `{ "id": "test1_scope_nhi", "role": "admin" }` to org
  `test1`.
- Create: `tests/resources/nhi/test-nhi-key.pem`, copied from metrics.
- Create: `api/src/scopes.ts`
- Modify: `api/src/server.ts:34`: `await session.init(config.privateDirectoryUrl, undefined, undefined, { scopeAware: true })`
- Modify: `api/src/auth.ts` (`resolveCaller`)
- Modify: `api/src/artefacts/router.ts` (guards on `GET /`, `GET /:id`, `GET /:id/download`)
- Create: `tests/support/nhi.ts`
- Test: `tests/scopes.api.spec.ts`

**Interfaces:**
- Produces, in `api/src/scopes.ts`:
  - `vocabulary`: from `defineScopes({ registry: { tiers: ['read'], descriptions: { umbrella: {fr,en}, read: {fr,en} } } })`
  - `acceptedScopes` and `scopeDescriptions`, re-exported from `vocabulary`
  - `scopedOperations = { listArtefacts: { method: 'get', path: '/artefacts', family: 'registry', tier: 'read' }, getArtefact: { method: 'get', path: '/artefacts/{id}', … }, downloadArtefact: { method: 'get', path: '/artefacts/{id}/download', … } } satisfies Record<string, ScopedOperation>`.
    Paths are relative to `/api/v1`.
  - `type ScopedOperationId = keyof typeof scopedOperations`
  - `requireOperationScope(id: ScopedOperationId): RequestHandler`
- Produces, in `tests/support/nhi.ts`: `nhiSession(scope?: string): Promise<{ cookieAx: AxiosInstance, bearerAx: AxiosInstance, accessToken: string }>`.
  Port it from metrics' `test-it/utils/nhi.ts`, with:
  - `directoryUrl` and `baseURL` from `tests/support/axios.ts`;
  - the assertion audience = `http://${DEV_HOST}:${NGINX_PORT}`, the site origin simple-directory sees.

- [ ] **Step 1: Dev env changes, then pause for the user**

Edit `api/package.json`, `package.json`, `docker-compose.yml`, `dev/resources/*.json` and the PEM as listed
above. Then stop and ask the user to:
1. stop the dev env;
2. run `npm install`;
3. restart it with `npm run dev-zellij`, so the simple-directory container is recreated with the new env and
   resources.

Continue once `npx --no df-dev status` shows every pane ready.

- [ ] **Step 2: Write the failing tests in `tests/scopes.api.spec.ts`**

Setup in `beforeEach`:
- `clean()`;
- upload `@test/pub@1` (public), `@test/priv-test1@1` (private, `privateAccess: [{ type: 'organization', id: 'test1' }]`)
  and `@test/priv-other@1` (private, no access), the same way as `tests/artefacts.api.spec.ts`;
- as superadmin, grant `test1` access (see `tests/access-grants.api.spec.ts` for the body);
- inject a scan on `@test/pub@1` through `PUT /api/test-env/artefacts/:id/scan`.

Tests:
- `'token exchange issues a registry:read scoped session'`: `decodeJwt(accessToken).scope === 'registry:read'`.
- `'registry:read lists the account catalog'`: `cookieAx.get('/api/v1/artefacts')` returns ids
  `['@test/priv-test1@1', '@test/pub@1']` in any order, and no result has a `scan` key.
- `'all:read and the bare registry umbrella are accepted'`: status 200 on the list for each.
- `'registry:read reads and downloads'`: `GET /api/v1/artefacts/@test%2Fpriv-test1%401` → 200; `/download`
  → 200 or 302.
- `'scopes never widen access'`: `GET` on `@test/priv-other@1` → 404 for both a `registry:read` session and
  `nhiSession()` (unscoped).
- `'another family is refused'`: a `datasets:read` session gets 403 on list, detail and download.
- `'non-catalog routes refuse registry:read'`: 403 on `GET /api/v1/access-grants/me`, `GET /api/v1/api-keys`
  and `PATCH /api/v1/artefacts/@test%2Fpub%401` `{ public: false }`.
- `'a scoped session is never admin'`: on the list with `?sort=-vulnerabilities`, no result carries `scan`,
  and the order equals the default sort's order. This covers the scoped-admin path through
  `resolveCaller`; the NHI is an org admin, not a superadmin, so this also checks the non-admin branch.
- `'unscoped session keeps working'`: `nhiSession()` lists with status 200.
- `'bearer token is accepted'`: the same as the list test through `bearerAx`. Skip it with a message when
  `decodeJwt(accessToken).aud` is unset (an older simple-directory image), as metrics does.

- [ ] **Step 3: Run the tests and check they fail**

Run: `npm run test-api -- tests/scopes.api.spec.ts`
Expected: the list, read and download tests FAIL with 403 "this service does not accept scope-restricted
sessions".

- [ ] **Step 4: Implement**

- `api/src/scopes.ts` per Interfaces. The fr/en descriptions say read access to the registry's artefact
  catalog: metadata and downloads of the artefacts visible to the account.
- Make the session scope-aware in `server.ts`.
- Mount `requireOperationScope('listArtefacts' | 'getArtefact' | 'downloadArtefact')` as route middleware on
  the three routes in `artefacts/router.ts`. Registry's global `session.middleware()` stays.
- `resolveCaller`: `if (session.user?.adminMode && !session.scopes) return { admin: true }`. A scoped session
  falls through to the account branch.

- [ ] **Step 5: Run the tests and check they pass**

Run: `npm run test-api -- tests/scopes.api.spec.ts`
Expected: all PASS, or the bearer test SKIPPED with its message.

- [ ] **Step 6: Run the full api and unit suites**

Run: `npm run test-unit && npm run test-api`
Expected: all PASS. This covers read keys, internal secret and unscoped sessions (Review Focus 4).

- [ ] **Step 7: Lint, type check and commit**

```bash
npm run lint-fix && npm run check-types
git add api/src/scopes.ts api/src/server.ts api/src/auth.ts api/src/artefacts/router.ts api/package.json package.json package-lock.json docker-compose.yml dev/resources tests/support/nhi.ts tests/resources/nhi tests/scopes.api.spec.ts
git commit -m "feat(scopes): accept registry:read scoped sessions on the catalog routes"
```

### Task 2: OpenAPI document with x-agent annotations

**Files:**
- Create: `api/contract/api-docs.ts`
- Modify: `api/src/app.ts` (route before the `/api` 404 catch-all)
- Create: `tests/fixtures/agent-surface.json` (generated)
- Test: `tests/api-docs.api.spec.ts`

**Interfaces:**
- Consumes: `vocabulary`, `acceptedScopes`, `scopedOperations`, `ScopedOperationId` from `api/src/scopes.ts`.
- Produces: `default (locale?: ScopeLocale) => OpenAPIDocument` in `api/contract/api-docs.ts`, plus the
  exported `AgentOperation` constants `searchArtefacts` and `getArtefact`, as in metrics.

- [ ] **Step 1: Write the failing tests in `tests/api-docs.api.spec.ts`**

- `'agent tools load without lint error and match the golden'`:
  - `load(apiDocs(), { baseUrl: 'http://localhost/registry/api/v1', lint: 'error' })` from
    `@data-fair/openapi-mcp`;
  - assert `toolSet.tools.map(t => t.name)` deep-equals `['search_artefacts', 'get_artefact']`;
  - compare `JSON.parse(JSON.stringify(toolSetSnapshot(toolSet)))` to `tests/fixtures/agent-surface.json`;
  - write the file when `UPDATE_GOLDEN=1`.
- `'every oauth2 requirement uses a declared scope and only shared or registry schemes'`:
  - walk `apiDocs()` paths;
  - every security scheme name is in `['sdCookie', 'oauth2', 'registryApiKey']`;
  - every `oauth2` scope is a key of `components.securitySchemes.oauth2.flows.clientCredentials.scopes`;
  - the three `scopedOperations` paths carry `oauth2` alternatives, and no other path does.
- `'served document is public, cached and localized'`:
  - `anonymousAx.get('/api/v1/api-docs.json')` → 200, `cache-control` `public, max-age=300`, `vary`
    contains `Accept-Language`;
  - with `Accept-Language: en`, the `registry:read` scope description equals
    `scopeDescriptions('en')['registry:read']`;
  - with `Accept-Language: de`, it equals the fr one.

- [ ] **Step 2: Run the tests and check they fail**

Run: `npm run test-api -- tests/api-docs.api.spec.ts`
Expected: FAIL, because `api/contract/api-docs.ts` does not exist.

- [ ] **Step 3: Implement `api/contract/api-docs.ts` and the route**

- Structure it as metrics' `api/contract/api-docs.ts` does, with the Global Constraints values. Top-level
  `security: [{ sdCookie: [] }]`.
- Paths:
  - **Browsing routes:**
    - `/artefacts`: `operationId: listArtefacts`. Query params `q`, `category` (enum of all categories),
      `format` (`npm`, `file`), `sort` (the `sortKeys` of the artefacts router, with a `-` prefix allowed),
      `size` (max 100), `skip`, `includeDeprecated`.
    - `/artefacts/{id}`: `operationId: getArtefact`.
    - `/artefacts/{id}/download`: `operationId: downloadArtefact`, binary response. Mention the
      `X-Artefact-*` headers and the 304 behaviour.

    Security is `operationSecurity(id)`, built from `scopedOperations` as in metrics, plus
    `{ registryApiKey: [] }` as a further alternative.
  - **Upload routes:** `/artefacts/npm/{id}` and `/artefacts/file/{name}`, multipart, with security
    `[{ registryApiKey: [] }]`.
  - **Superadmin routes**, summaries only, security `[{ sdCookie: [] }]`:
    - `PATCH` and `DELETE /artefacts/{id}`, `/artefacts/groups`, `/artefacts/scan-summary`;
    - `/artefacts/{id}/scan`;
    - `/api-keys`, `/access-grants`, `/remote-registries`.

    Check each router for its routes.
- Schemas: put the artefact type schema (`api/types/artefact/schema.json`) under `components.schemas`, with
  its local refs resolved as metrics does. Reference it from the list (`{ results, count }`) and detail
  responses.
- `x-agent` on the list route is `searchArtefacts`, with:
  - title `{ en: 'Search artefacts', fr: 'Rechercher des artefacts' }`;
  - a description saying an artefact is a plugin or file hosted by the registry (processing, catalog,
    application and skill npm packages; tilesets and map styles as files), and that results are limited to
    what the active account can see;
  - `params` descriptions for `q`, `category`, `format` and `size`;
  - `response: { rows: '/results' }`.

  `x-agent` on the detail route is `getArtefact`, `name: 'get_artefact'`.
- Route in `app.ts`, as in metrics, at `/api/v1/api-docs.json`.

- [ ] **Step 4: Generate the golden and run the tests**

Run: `UPDATE_GOLDEN=1 npm run test-api -- tests/api-docs.api.spec.ts`, then the same command without
`UPDATE_GOLDEN`.
Expected: PASS. Read `tests/fixtures/agent-surface.json`: the tools, their params and their descriptions must
read well for an agent.

- [ ] **Step 5: Lint, type check and commit**

```bash
npm run lint-fix && npm run check-types
git add api/contract/api-docs.ts api/src/app.ts tests/api-docs.api.spec.ts tests/fixtures/agent-surface.json
git commit -m "feat(api): serve an OpenAPI document with scopes and agent tools"
```

### Task 3: Document it for contributors

**Files:**
- Modify: `AGENTS.md`: a short "API doc and scopes" section. Cover:
  - `api/src/scopes.ts` is the single table; a new session-facing route that scoped tokens should reach goes
    there and in the doc;
  - the golden: regenerate with `UPDATE_GOLDEN=1`;
  - the NHI test identity;
  - the data-fair merge constraints: link the spec.

- [ ] **Step 1: Write the section and run `npm run quality`**

Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md docs/superpowers
git commit -m "docs: api doc and scopes for contributors, design and plan"
```
