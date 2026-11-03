# Registry API doc with OAuth scopes, merged into the platform doc

## Intent

The other data-fair services (data-fair, simple-directory, metrics, events) each serve an OpenAPI document
that declares the OAuth scopes they enforce and carries `x-agent` annotations. data-fair fetches these
documents over private URLs and merges them into one "platform" API doc per site, and
`@data-fair/openapi-mcp` turns that doc into MCP tools for agents. Registry has none of this today: it has
no API doc, and it refuses every scope-restricted session.

Goal: registry follows the same pattern so an agent with a scoped token can **browse the artefact catalog
read-only** for its account. The registry side is built in this work. The data-fair side, where registry is
added to the merged services, is only planned here (last section).

Reference implementation to copy: the metrics service (`~/data-fair/metrics`, commits `18a9dec` and
`ca9235a`): `api/src/scopes.ts`, `api/contract/api-docs.ts`, `api/src/app.ts`, `test-it/03-agent-api-docs.ts`,
`test-it/05-scopes.ts`, `test-it/utils/nhi.ts`.

## Goals

- A `registry` scope family with a single `read` tier, declared with `defineScopes` from
  `@data-fair/lib-common-types/scopes.js`. The global `all:read`, `all:write` and `all:admin` scopes cover
  it automatically through `acceptedScopes`.
- The session is initialised as scope-aware: `session.init(config.privateDirectoryUrl, undefined, undefined, { scopeAware: true })`.
- These catalog-browsing routes accept scoped sessions holding `registry:read`, `registry`, or an `all:*` scope.
  They are guarded through a `scopedOperations` table and `requireOperationScope(id)`, as in metrics:
  - `GET /api/v1/artefacts` (list)
  - `GET /api/v1/artefacts/:id` (detail)
  - `GET /api/v1/artefacts/:id/download`. Download is allowed for scoped tokens; the access-grant check
    still applies.
  - Thumbnails need nothing. `GET /api/v1/thumbnails/:id/data` never reads the session, so it needs no guard.
    `/artefacts/:id/thumbnail` only has POST and DELETE, which are admin or internal-secret and already
    refuse scoped sessions.
- Every other route keeps refusing scoped sessions. lib-express already refuses them when a route reads the
  session without checking a scope first. Nothing has to be added for those routes, but a test must prove it.
- `GET /api/v1/api-docs.json`: public, `Cache-Control: public, max-age=300`, `Vary: Accept-Language`, built
  for `fr` or `en` from `Accept-Language` (default `fr`, as in metrics). OpenAPI 3.1.
- Two agent tools through `x-agent`:
  - `search_artefacts`: on the list route. Covers text search `q`, `category`, `format`, `sort`, `size`,
    `skip`, `includeDeprecated`.
  - `get_artefact`: on the detail route.

  Both have fr/en titles and descriptions written for an agent: what an artefact is (a plugin or file hosted
  by the registry, for processings, catalogs, applications, map tilesets…), and that results are limited to
  what the active account can see.
- Tests: an agent-surface golden test, and scope tests.

## Non-goals

- No write, admin or upload tools for agents, and no scope tier above `read`.
- No markdown agent skill for now: two tools need no usage guide.
- No change to the existing auth paths: read API keys (`x-api-key`), the internal secret with `x-account`,
  and unscoped cookie sessions behave exactly as today.
- The data-fair side is not implemented here.

## Anti-goals (a failure even if it works)

- A scoped token reaching any superadmin route, or seeing admin-only data such as `scan`.
- A scoped token gaining more access than the same account's unscoped session.
- A document data-fair's merge would refuse (see the constraints below), or that openapi-mcp loads with lint
  errors.

## Constraints from the data-fair merge (`data-fair/api/contract/platform-api-docs.ts`)

- Security scheme names must be exactly:
  - `sdCookie`: `{ type: 'apiKey', in: 'cookie', name: 'id_token' }`
  - `apiKey`: `{ type: 'apiKey', in: 'header', name: 'x-apiKey' }`
  - `oauth2`: built by `oauth2SecurityScheme(vocabulary, { directoryUrl: '/simple-directory', locale })`

  A scheme declared under one of these names with another definition makes data-fair refuse the whole
  document. Registry's own upload/read key header is `x-api-key`. The `in`/`name` comparison is exact, so
  document registry keys under a distinct scheme name (e.g. `registryApiKey`). The merge drops that scheme
  and falls back to `sdCookie` for the operations that use it, which is acceptable.
- Every oauth2 scope an operation requires must be declared by the oauth2 scheme. Use `oauth2Alternatives`:
  one requirement per accepted scope.
- Operation security for the browsing routes is `[{ sdCookie: [] }, ...oauth2Alternatives(acceptedScopes('registry', 'read'))]`.
  The read-key scheme may be added as an extra alternative.
- `x-agent` keys must be among those the merge accepts: `name`, `title`, `description`, `examples`,
  `annotations`, `params`, `fixed`, `body`, `bodyFields`, `bodyRequired`, `response`, `editor`, `security`.
- `servers: [{ url: '/registry/api/v1' }]`, relative and without an origin, with paths relative to it
  (`/artefacts`, `/artefacts/{id}`…). On the platform, registry is mounted at `/registry` (see the dev nginx
  config).

## Decided by the user

- Agents only browse the catalog; a read-only scope is enough.
- Implement the registry side; only plan the data-fair side.

## Calls made by Claude (open to review)

- Downloads accept `registry:read` scoped tokens, though no agent tool is exposed for them.
- The doc also documents the superadmin and upload routes as a reference for people. Superadmin routes
  declare only `sdCookie`; upload routes declare the registry key scheme.
- A scoped session is never treated as admin, even when its user is a superadmin. This fails closed: no scan
  data, no admin sorts.
- Doc location: `api/contract/api-docs.ts`, next to the existing `api/doc/` schemas, which it reuses for
  request and response bodies where they exist (e.g. the artefact type schema).

## Tests

- **Agent surface:** load the doc with `@data-fair/openapi-mcp` `load(apiDocs(), { baseUrl, lint: 'error' })`.
  Assert the tool names are `['search_artefacts', 'get_artefact']`, and pin `toolSetSnapshot` against
  `tests/fixtures/agent-surface.json` (regenerate with `UPDATE_GOLDEN=1`). Add openapi-mcp as a dev
  dependency, the same version range as metrics.
- **Served doc:** `GET /api/v1/api-docs.json` answers in fr and en and is public.
- **Scopes,** with a scoped session minted through a simple-directory non-human identity, as metrics does:
  - an NHI user in `dev/resources/users.json` with an inline jwks and an org membership;
  - `MANAGE_NHIS=true` and `NHIS_ALLOW_INSECURE_ISSUERS=true` on the dev simple-directory container;
  - `jose` to sign the assertion.

  Cases:
  - `registry:read` and `all:read` list and read the account's visible artefacts.
  - A token scoped to something else (e.g. `datasets:read`) gets 403 on the browsing routes.
  - A `registry:read` token gets 403 on a superadmin route, e.g. `PATCH /artefacts/:id` and `GET /api-keys`.
  - An unscoped session still works as before.

  If the dev simple-directory image does not support this, report it rather than working around it.

Notes, checked against the code:
- `@data-fair/lib-common-types` is only a transitive dependency today; add it to `api/package.json`.
- simple-directory doesn't check requested scopes when it exchanges the token (the known-scopes list only
  limits what admins store on an NHI). The test NHI can therefore get a `registry:read` token before
  data-fair merges registry.
- The global `session.middleware()` in `app.ts` is fine as it is. With `scopeAware` it doesn't refuse scoped
  sessions; refusal happens per route, through `reqSession` in `resolveCaller` and through `reqAdminMode`.
- **Dev env step for the user:** new dependencies (`@data-fair/openapi-mcp`, `jose`,
  `@data-fair/lib-common-types`) and the new simple-directory environment variables mean the user has to
  stop the env, run `npm install`, and restart it, so the container is recreated. Agents must not do this
  themselves (AGENTS.md). The plan must pause for it before the scope tests run.

## Left to the builder

- Exact wording of descriptions and `x-agent` params, within the openapi-mcp lint rules.
- How much of the superadmin surface to document in detail; summaries are enough.
- Whether docs-only schemas need new `api/doc/*` entries (run `npm run build-types` after schema changes).

## Planned, not built: data-fair side

In `data-fair/api/src/platform-api-docs/service.ts`:

1. Add `'registry'` to `PlatformServiceId` in `api/contract/platform-api-docs.ts`.
2. In `platformServices()`, when `cfg.privateRegistryUrl` is set (the config key already exists), push
   `{ service: { id: 'registry', title: 'Registry', mountPath: '/registry/api/v1', docPath: '/registry/api/v1/api-docs.json' }, url: cfg.privateRegistryUrl + '/api/v1/api-docs.json' }`,
   and pass `privateRegistryUrl` in the `cfg` type.
3. Tools are then namespaced `registry_search_artefacts` and `registry_get_artefact`. The `registry:*`
   scopes reach simple-directory through `platformScopes()`, so admins can grant them to NHIs and OAuth
   clients.
4. Tests: extend data-fair's platform doc tests with a registry fragment fixture. In dev, set
   `privateRegistryUrl` in `development.cjs` if a registry runs in data-fair's dev env.
