# Implementation Plan

Phased plan for the registry service. Reference architecture: ../agents.

## Phase 1 — Project scaffolding

Set up the full monorepo with dev environment and test infrastructure.

### Monorepo structure

```
registry/
├── api/                        # Express backend workspace
│   ├── src/
│   │   ├── app.ts              # Express app (helmet, session, routers, SPA, errorHandler)
│   │   ├── server.ts           # start/stop (mongo, locks, events, observer, http)
│   │   ├── config.ts           # typed config re-export
│   │   ├── mongo.ts            # MongoDB collections + indexes
│   │   └── routers/            # one file per resource
│   ├── config/
│   │   ├── default.js
│   │   ├── development.js
│   │   ├── production.js
│   │   ├── custom-environment-variables.js
│   │   └── type/index.ts       # config type definition
│   ├── index.ts                # entry point (start + SIGTERM)
│   ├── nodemon.json
│   └── package.json
├── ui/                         # Vue 3 + Vuetify workspace
│   ├── src/
│   │   ├── main.ts             # app bootstrap (router, session, vuetify, i18n, d-frame)
│   │   ├── context.ts          # $uiConfig, $sitePath, $apiPath, $fetch
│   │   ├── pages/              # auto-routed
│   │   ├── components/
│   │   │   └── vjsf/           # generated VJSF components
│   │   ├── composables/
│   │   └── utils/
│   ├── vite.config.ts
│   └── package.json
├── shared/                     # types + constants
│   └── package.json
├── lib-node/                   # client library workspace (Phase 6, placeholder only)
│   └── package.json
├── tests/
│   ├── state-setup.ts
│   ├── state-teardown.ts
│   └── *.{unit,api,e2e}.spec.ts
├── dev/
│   ├── init-env.sh             # random port allocation (.env)
│   ├── worktree.sh             # create worktree + init
│   ├── delete-worktree.sh      # remove worktree
│   ├── status.sh               # check all services status (read-only)
│   ├── logs/
│   └── resources/
│       ├── nginx.conf.template # proxy: /registry/api → api, /registry → ui, /simple-directory, /events
│       ├── users.json          # test users (superadmin, org admin, regular user, standalone)
│       └── organizations.json  # test orgs with role assignments
├── docker-compose.yml          # nginx, maildev, simple-directory, events, mongo
├── .zellij.kdl                 # 4-pane layout: shell+deps | ui+api
├── playwright.config.ts        # sequential, projects: state-setup/teardown, unit, api, e2e
├── tsconfig.json
├── eslint.config.mjs
├── .nvmrc
├── .gitignore
├── Dockerfile                  # multi-stage: build → runtime
└── package.json                # workspaces, scripts (dev-api, dev-ui, dev-deps, dev-zellij, test, lint, build-types, quality)
```

### Dev scripts (root package.json)

- `dev-api`: run API with nodemon
- `dev-ui`: run Vite dev server
- `dev-deps`: docker compose up (mongo, nginx, simple-directory, events, maildev)
- `dev-zellij`: full dev layout (dotenv -- zellij --layout .zellij.kdl)
- `build-types`: generate VJSF components from type schemas
- `test`: playwright unit → api → e2e (sequential, --max-failures=1)
- `lint` / `lint-fix`: eslint (neostandard + vue)
- `check-types`: tsc
- `quality`: lint + build-types + check-types + test

### Docker Compose services

- nginx (reverse proxy, network_mode: host)
- mongo 8.x (data volume)
- simple-directory (auth, test users/orgs)
- events (notifications)
- maildev (mail mock)

### Playwright test suite

- workers: 1, sequential
- state-setup / state-teardown projects
- unit (*.unit.spec.ts) — pure logic
- api (*.api.spec.ts) — HTTP calls with auth fixtures
- e2e (*.e2e.spec.ts) — browser with Desktop Chrome

### Deliverable

`npm run dev-zellij` starts the full environment. `npm run test` runs the suite (initially just a ping test).

## Phase 2 — MongoDB schema and artefact CRUD

### Collections

**artefacts** — one doc per package name + major version:
- `_id`, `name`, `majorVersion`
- manifest metadata (from package.json): `packageName`, `version`, `licence`, `category`
- editable metadata (VJSF form, superadmin PATCH): i18n `title`, i18n `description`, `thumbnail`
- `public` (boolean, default false), `privateAccess` (array of {type, id}) — superadmin PATCH
- `category`: enum (processing, catalog, application, other)
- category-specific fields (e.g. processingConfigSchema, applicationConfigSchema)
- `createdAt`, `updatedAt`

**versions** — one doc per version:
- `_id`, `artefactId` (ref), `version` (semver string), `architecture` (optional)
- `tarballPath` (storage backend path)
- `uploadedAt`
- indexes: unique on (artefactId, version, architecture)

**api-keys**:
- `_id`, `type` (upload | federation), `name`, `hashedKey`
- `createdBy` (account ref), `createdAt`
- for federation keys: `owner` (account that manages it)

**access-grants**:
- `_id`, `account` ({type, id}), `grantedBy`, `grantedAt`

### API endpoints

- `POST   /api/v1/artefacts/:name/versions` — upload tarball (multipart, requires upload API key)
- `GET    /api/v1/artefacts` — list (filtered by access)
- `GET    /api/v1/artefacts/:id` — detail + version list
- `PATCH  /api/v1/artefacts/:id` — update editable metadata, public, privateAccess (superadmin)
- `DELETE /api/v1/artefacts/:id` — remove (superadmin)
- `GET    /api/v1/artefacts/:id/versions/:version` — resolve version, return metadata
- `GET    /api/v1/artefacts/:id/versions/:version/tarball` — download (granted access or internal secret + account context)
- `POST   /api/v1/api-keys` — create key (superadmin for upload, granted account for federation)
- `GET    /api/v1/api-keys` — list keys
- `DELETE /api/v1/api-keys/:id` — revoke
- `POST   /api/v1/access-grants` — grant access (superadmin)
- `GET    /api/v1/access-grants` — list grants
- `DELETE /api/v1/access-grants/:id` — revoke (superadmin)

### Access control

- superadmin (session.adminMode): all operations
- upload API key (x-api-key header): upload only
- internal secret (assertReqInternalSecret): download tarball, must provide account in headers/query to check privateAccess
- granted access (session user with grant): list + download artifacts matching public/privateAccess
- regular session user: list artifacts matching public/privateAccess (no download)

### Deliverable

Full CRUD via API, access control enforced, tested with api spec tests covering each access level.

## Phase 3 — Files storage (dual backend)

- FileBackend interface: writeStream, readStream, delete, exists
- FsBackend: local disk (config.dataDir/tarballs/)
- S3Backend: object storage (dual client pattern from data-fair)
- Backend selection via config.filesStorage ('fs' | 's3')
- 2-deep retention: on upload, if there are more than 2 versions for a minor branch, delete the oldest tarball + version doc

### Deliverable

Upload/download works with fs backend in dev, S3 testable via config switch.

## Phase 4 — Admin UI

Superadmin pages:

- Artefact list: table with search, filter by category/public/private, sortable
- Artefact detail: manifest metadata display, VJSF form for editable metadata (i18n title, description, thumbnail), PATCH on save
- public/privateAccess: patchable properties on the artefact detail page (similar to processings private-access component)
- Version list per artefact
- API key management: create/list/revoke upload keys
- Access grants: grant/list/revoke account access

### Deliverable

Superadmins can manage the full registry through the UI. VJSF used for metadata editing.

## Phase 5 — Account-facing UI

Pages for users with access:

- Browse artefacts (filtered by access permissions)
- Artefact detail with version list
- Download (if account has granted access)
- Federation API key management (if account has granted access)

### Deliverable

Non-admin users can browse and download resources.

## Phase 6 — Client library (@data-fair/lib-node-registry)

Deferred. Will be implemented once API is stable. Workspace already scaffolded as placeholder in Phase 1.
