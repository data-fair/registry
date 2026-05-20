# CI Integration Guide

This guide covers how to publish artefacts to the registry from GitHub Actions and GitLab CI, with best practices to prevent supply chain attacks.

## API Key Setup

Upload API keys are created by a superadmin in the registry UI ("Admin → API keys → New"). Pick:

- **Type:** `upload`.
- **Name:** something you can audit — e.g. `ci-<plugin>-<env>` (`ci-processing-gpkg-prod`).
- **Allowed name prefix:** the artefact-id prefix the key may upload to — `@data-fair-processing-gpkg` covers every ref (`-1`, `-2`, `-main`, …). Keep it specific: a short prefix would also match sibling plugins that share it.
- **Allowed category:** optional, but recommended for tileset-style file uploads (`tileset`, `maplibre-style`).

The raw key is displayed **once** at creation time — copy it immediately and store it as a CI secret. It is never retrievable again (only a SHA-512 hash is stored server-side).

You need **one key per registry environment**. A key issued by `koumoul.com/registry` will not authenticate against `staging-koumoul.com/registry` and vice-versa.

## Authentication

All upload requests use the `x-api-key` HTTP header:

```bash
curl -X POST https://registry.example.com/api/v1/artefacts/npm/<id> \
  -H "x-api-key: $REGISTRY_API_KEY" \
  -F file=@package.tgz
```

---

## GitHub Actions

The recommended setup for an npm-format plugin (processing, catalog, application) is **one workflow file, triggered on `v*` tags, publishing a tarball that bundles `node_modules` built inside the same Alpine image consumers run**. Three steps end-to-end.

> **Artefact id.** Throughout this guide the artefact id is the plugin's npm `package.json#name` with `/` flattened to `-`, plus a ref suffix — `-<major>` for releases (`@data-fair-processing-gpkg-1`), `-<branch>` for dev builds (`@data-fair-processing-gpkg-main`). The processings service stores this id verbatim on `processing.plugin`, and the v6 migration publishes legacy plugins under the same form, so CI must upload to the exact same id or builds land on an artefact nothing references.

### Step 1 — Create the upload API key

In the registry UI (see [API Key Setup](#api-key-setup) above), create a key for the production registry (e.g. `https://koumoul.com/registry`):

- **Type:** `upload`
- **Name:** `ci-<plugin>-prod` (e.g. `ci-processing-gpkg-prod`)
- **Allowed name prefix:** `@data-fair-processing-gpkg` (the `package.json#name` with `/` flattened to `-`) — a prefix match covering every ref of the plugin (`-1`, `-2`, `-main`, etc.)

Copy the key immediately — it is shown once.

### Step 2 — Create the `production` environment and store the key

**Use environment secrets, not repository secrets** (see [Security Best Practices](#github-actions-understanding-the-threat-model) below).

UI flow:

1. Repo → **Settings > Environments > New environment** → name `production`.
2. Add a **required reviewer** (deployment protection rule).
3. Under **Deployment branches and tags**, add the rule `v*` so the environment is only available on release tags.
4. Click **Add secret** → name `REGISTRY_API_KEY`, value = the key from step 1.

Or with the GitHub CLI:

```bash
gh api -X PUT "repos/$OWNER/$REPO/environments/production" \
  -f reviewers='[{"type":"User","id":<your-user-id>}]' \
  --field deployment_branch_policy='{"protected_branches":false,"custom_branch_policies":true}'
gh api -X POST "repos/$OWNER/$REPO/environments/production/deployment-branch-policies" -f name='v*'
gh secret set REGISTRY_API_KEY --env production
```

### Step 3 — Add the publish workflow

The tarball must contain `node_modules` because consumer services (e.g. the processings worker) install the artefact via `@data-fair/lib-node-registry`, which only extracts the tarball — it never runs `npm install`. Native binaries must be built on the same base image consumers run (currently `node:24.11.1-alpine3.22`), or musl-vs-glibc mismatches will crash at load time.

`.github/workflows/publish.yml`:

```yaml
name: Publish to Registry
on:
  push:
    tags:
      - 'v*'

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    if: github.ref_type == 'tag' && github.event_name == 'push'
    environment: production
    env:
      REGISTRY_URL: https://koumoul.com/registry
      # Must match the base image used by the consumer service (e.g. processings).
      # Bump this in lockstep with the consumer Dockerfile.
      ALPINE_NODE_IMAGE: node:24.11.1-alpine3.22
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc

      - name: Check tag matches package.json version
        run: |
          TAG_VERSION="${GITHUB_REF_NAME#v}"
          PKG_VERSION=$(node -p "require('./package.json').version")
          if [ "$TAG_VERSION" != "$PKG_VERSION" ]; then
            echo "::error::tag $GITHUB_REF_NAME does not match package.json version $PKG_VERSION"
            exit 1
          fi

      - name: Build artefact with bundled node_modules
        run: |
          set -euo pipefail
          # 1. Source layer via `npm pack` — respects package.json#files.
          npm pack
          TARBALL=$(ls ./*.tgz)

          # 2. Extract to ./build/package/ (npm tarball's top-level prefix).
          mkdir build
          tar xzf "$TARBALL" -C build

          # 3. `npm pack` excludes package-lock.json; copy it in for a
          # reproducible `npm ci`.
          cp package-lock.json build/package/

          # 4. Install prod deps INSIDE the consumer base image so native
          # bindings are musl-linked and match what runs in production.
          docker run --rm \
            -v "$PWD/build/package:/work" -w /work \
            "$ALPINE_NODE_IMAGE" \
            npm ci --omit=dev --omit=optional --no-audit --no-fund

          # 5. Repack, preserving the `package/` prefix the registry expects.
          tar czf with-deps.tgz -C build package

      - name: Upload to registry
        env:
          REGISTRY_API_KEY: ${{ secrets.REGISTRY_API_KEY }}
        run: |
          set -euo pipefail
          PACKAGE_NAME=$(node -p "require('./package.json').name")
          PACKAGE_MAJOR=$(node -p "require('./package.json').version.split('.')[0]")
          # Artefact id: package name with '/' flattened to '-', plus '-<major>'.
          ARTEFACT_ID="${PACKAGE_NAME//\//-}-${PACKAGE_MAJOR}"
          ENCODED_ID=$(node -p "encodeURIComponent('${ARTEFACT_ID}')")
          curl -f -X POST \
            "${REGISTRY_URL}/api/v1/artefacts/npm/${ENCODED_ID}" \
            -H "x-api-key: ${REGISTRY_API_KEY}" \
            -F "architecture=x64" \
            -F "file=@with-deps.tgz"
```

Then cut a release the usual way:

```bash
npm version patch        # bumps package.json + creates a vX.Y.Z tag
git push --follow-tags
```

The `production` environment will pause the run until your reviewer approves; on approval the build pushes one `architecture=x64` tarball to the registry. Consumers running on `process.arch === 'x64'` pick it up automatically — the consumer-side `ensureArtefact` call defaults to `process.arch` when no architecture is passed.

> **Building arm64 artefacts** uses the same workflow with `runs-on: ubuntu-24.04-arm` (or a self-hosted arm64 runner) — the `architecture=x64` form field becomes `architecture=arm64`. A multi-arch matrix is a straight extension of this recipe.

### Workflow example (file artefact)

```yaml
name: Publish tileset
on:
  push:
    tags:
      - 'v*'

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    if: github.ref_type == 'tag' && github.event_name == 'push'
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Build tileset
        run: ./build-tileset.sh

      - name: Upload to registry
        env:
          REGISTRY_API_KEY: ${{ secrets.REGISTRY_API_KEY }}
        run: |
          curl -f -X POST \
            "https://registry.example.com/api/v1/artefacts/file/my-tileset" \
            -H "x-api-key: ${REGISTRY_API_KEY}" \
            -F "file=@output/terrain.mbtiles" \
            -F "category=tileset" \
            -F 'title={"fr":"Terrain","en":"Terrain"}'
```

---

## Publishing a branch build to staging

For development builds that should land in the **staging** registry (e.g. each push to `main`) without bumping a semver release, upload to an npm artefact whose ref is the branch name (e.g. `@data-fair-processing-gpkg-main`). It carries one mutable tarball per architecture slot — the registry's docker-tag analogue — replaced in place on each upload.

Two registries, two artefacts:

| Production registry | Staging registry |
|--------------------|------------------|
| `@data-fair-processing-gpkg-1` (npm release ref) | `@data-fair-processing-gpkg-1` (npm, mirrored from prod via federation, read-only) |
|  | `@data-fair-processing-gpkg-main` (npm dev ref, local) |

The registry doesn't distinguish dev refs from release refs at the federation layer — operators decide which artefacts each downstream registry mirrors via `selectedArtefacts`. If you don't list the `-main` artefact in a remote's selection it simply isn't pulled.

### Step 1 — Create the staging upload API key

In the **staging** registry UI, create a key (separate from the production one):

- **Type:** `upload`
- **Name:** `ci-<plugin>-staging` (e.g. `ci-processing-gpkg-staging`)
- **Allowed name prefix:** `@data-fair-processing-gpkg` — covers `-main`, `-1`, etc.

This key only authenticates against the staging registry. The production key from the tag flow above stays unchanged.

### Step 2 — Create the `staging` environment and store the key

Same UI flow as the production environment, but **without** the `v*` deployment-branch rule (the trigger here is `push` on `main`):

```bash
gh api -X PUT "repos/$OWNER/$REPO/environments/staging" \
  --field deployment_branch_policy='{"protected_branches":false,"custom_branch_policies":true}'
gh api -X POST "repos/$OWNER/$REPO/environments/staging/deployment-branch-policies" -f name='main'
gh secret set REGISTRY_API_KEY --env staging
```

Required-reviewer protection is optional here — staging builds are typically auto-published.

### Step 3 — Add the branch-publish workflow

`.github/workflows/publish-main.yml`:

```yaml
name: Publish main to Staging Registry
on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    environment: staging
    env:
      REGISTRY_URL: https://staging-koumoul.com/registry
      ALPINE_NODE_IMAGE: node:24.11.1-alpine3.22
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc

      - name: Build artefact with bundled node_modules
        run: |
          set -euo pipefail
          npm pack
          TARBALL=$(ls ./*.tgz)
          mkdir build
          tar xzf "$TARBALL" -C build
          cp package-lock.json build/package/
          docker run --rm \
            -v "$PWD/build/package:/work" -w /work \
            "$ALPINE_NODE_IMAGE" \
            npm ci --omit=dev --omit=optional --no-audit --no-fund
          tar czf with-deps.tgz -C build package

      - name: Upload branch build to staging
        env:
          REGISTRY_API_KEY: ${{ secrets.REGISTRY_API_KEY }}
        run: |
          set -euo pipefail
          PACKAGE_NAME=$(node -p "require('./package.json').name")
          # Artefact id: package name with '/' flattened to '-', plus '-<branch>'.
          ARTEFACT_ID="${PACKAGE_NAME//\//-}-${GITHUB_REF_NAME}"
          ENCODED_ID=$(node -p "encodeURIComponent('${ARTEFACT_ID}')")
          curl -f -X POST \
            "${REGISTRY_URL}/api/v1/artefacts/npm/${ENCODED_ID}" \
            -H "x-api-key: ${REGISTRY_API_KEY}" \
            -F "architecture=x64" \
            -F "file=@with-deps.tgz"
```

Notes:

- The build step is byte-for-byte identical to the tag-flow build step. Don't extract it into a reusable workflow yet — copy-paste stays readable until there's a third consumer.
- No tag-vs-`package.json` version check here; there's no tag. The manifest's `version` is stored on the artefact doc for display only.

### Consumer side

On the staging instance, when an operator creates a processing against the staging registry:

1. The processings UI's plugin picker shows the `-main` artefact alongside the federated releases, with a dev-build chip.
2. Picking it stores `plugin = "@data-fair-processing-gpkg-main"` on the processing.
3. The worker resolves it via `ensureArtefact` on each run. The on-disk cache is keyed by the artefact's `dataUpdatedAt`, so every successful CI push triggers a fresh download on the next processing run.

Consumer services need `@data-fair/lib-node-registry` **≥ 0.4.0**.

---

## GitLab CI

### Storing the secret

1. Go to **Settings > CI/CD > Variables** in your project (or group for shared secrets).
2. Create a variable named `REGISTRY_API_KEY`.
3. Check **"Protect variable"** so it is only available on protected branches/tags.
4. Check **"Mask variable"** to prevent it from appearing in job logs.

### Pipeline example (npm tarball)

```yaml
publish:
  stage: deploy
  image: node:20
  # CRITICAL: only run on protected tags
  rules:
    - if: $CI_COMMIT_TAG =~ /^v/
      when: on_success
  script:
    - npm ci
    - npm pack
    - |
      TARBALL=$(ls *.tgz)
      PACKAGE_NAME=$(node -p "require('./package.json').name")
      PACKAGE_MAJOR=$(node -p "require('./package.json').version.split('.')[0]")
      ARTEFACT_ID="${PACKAGE_NAME//\//-}-${PACKAGE_MAJOR}"
      ENCODED_ID=$(node -p "encodeURIComponent('${ARTEFACT_ID}')")
      curl -f -X POST \
        "${REGISTRY_URL}/api/v1/artefacts/npm/${ENCODED_ID}" \
        -H "x-api-key: ${REGISTRY_API_KEY}" \
        -F "file=@${TARBALL}"
```

### Pipeline example (file artefact)

```yaml
publish-tileset:
  stage: deploy
  image: node:20
  rules:
    - if: $CI_COMMIT_TAG =~ /^v/
      when: on_success
  script:
    - ./build-tileset.sh
    - |
      curl -f -X POST \
        "${REGISTRY_URL}/api/v1/artefacts/file/my-tileset" \
        -H "x-api-key: ${REGISTRY_API_KEY}" \
        -F "file=@output/terrain.mbtiles" \
        -F "category=tileset" \
        -F 'title={"fr":"Terrain","en":"Terrain"}'
```

---

## Security Best Practices

### GitHub Actions: understanding the threat model

**The core problem:** GitHub repository secrets are available to **any workflow run triggered from any branch**, not just the default branch. A contributor who can push a branch (but not merge to main) can modify `.github/workflows/*.yml` on that branch, add a `workflow_dispatch` or `push` trigger, and exfiltrate the secret.

Trigger-level conditions (`on: push: tags`, `if: github.ref_type == 'tag'`) are **not sufficient** because they only control the workflow file *on that branch*. An attacker replaces the workflow entirely.

#### The right solution: environment secrets (mandatory)

**Do not use plain repository secrets for upload keys.** Use **environment secrets** instead:

1. **Create a GitHub environment** (e.g., `production`) in **Settings > Environments**.
2. **Add the API key as an environment secret** (not a repository secret).
3. **Configure deployment protection rules:**
   - **Required reviewers** — a maintainer must approve before the job runs.
   - Optionally restrict to specific branches/tags (e.g., only `main` and `v*` tags).
4. **Reference the environment in the job** with `environment: production`.

With this setup, even if an attacker pushes a branch with a modified workflow that references the `production` environment, the job **pauses and waits for a reviewer to approve** — the secret is never injected without human review.

#### Additional layers (defense in depth)

| Layer | What it does | How to set it up |
|-------|-------------|-----------------|
| **Environment branch restriction** | The environment is only available on specific branches/tags. Jobs on other branches get no secret at all. | Environment settings > Deployment branches > Add rule (e.g., `main`, `v*`). |
| **Tag protection rules** | Prevent unauthorized users from creating tags. | Settings > Tags > Add rule. Or use rulesets. |
| **Branch protection / rulesets** | Require PR review before merging to main. | Settings > Rules > Rulesets. |
| **CODEOWNERS on `.github/`** | Workflow file changes require approval from specific people. | Add `.github/` to CODEOWNERS file. |
| **Fork PR secret isolation** | Secrets are not available in `pull_request` events from forks (GitHub default). | Already the default; do not use `pull_request_target` with checkout of PR code. |

#### What does NOT protect you

- `if: github.ref_type == 'tag'` — an attacker removes this condition on their branch.
- `on: push: tags: ['v*']` — an attacker changes the trigger on their branch.
- Repository secrets alone — available to all branches.
- `permissions: contents: read` — controls GitHub token scope, not secret access.

### GitLab CI: the protected variables model

GitLab has a simpler built-in solution: **protected variables**.

1. Mark `REGISTRY_API_KEY` as **protected** in Settings > CI/CD > Variables.
2. Protected variables are **only injected into pipelines running on protected branches or protected tags**.
3. A contributor pushing to a feature branch (unprotected) gets **no access** to the variable, regardless of what they write in `.gitlab-ci.yml`.
4. Additionally, mark the variable as **masked** to prevent accidental log exposure.

This is inherently more secure than GitHub's default model — the protection is at the platform level, not the workflow level.

| Layer | What it does |
|-------|-------------|
| **Protected variable** | Variable only available on protected refs. |
| **Protected tags** | Only maintainers can create release tags. Settings > Repository > Protected tags. |
| **Protected branches** | Merge to main requires approval. Settings > Repository > Protected branches. |
| **Masked variable** | Value is redacted in job logs. |

### Key management

- **One key per CI project** (or per artefact). If a key leaks, you revoke only the affected one without breaking other pipelines.
- **Name keys descriptively** (e.g., `ci-my-plugin-github`) so you can audit them.
- **Rotate keys periodically.** Create a new key, update the CI secret, then revoke the old key via `DELETE /api/v1/api-keys/:id`.
- **Never commit keys** to the repository. Use CI secret storage exclusively.

### Build integrity

- **Pin your dependencies** (`npm ci` with a lockfile, not `npm install`).
- **Pin action/image versions** (use SHA references for GitHub Actions: `actions/checkout@<sha>`).
- **Publish only from tags** on protected branches, never from arbitrary commits.
- **Use `npm pack`** to build the tarball from the checked-out source, not from a remote registry.
- **Review tag protection rules**: on GitHub, restrict who can create tags; on GitLab, use protected tags.

### What the registry does NOT do (your responsibility)

- **No IP allowlisting**: any client with a valid key can upload. Protect the key.
- **No content signing**: the registry does not verify tarball signatures. Consider signing artefacts in CI and verifying on the consumer side if your threat model requires it.
- **No rate limiting**: a leaked key could be used for rapid uploads. Monitor and rotate quickly.

### Minimal checklist

- [ ] API key stored as a CI secret (never in code)
- [ ] API key scoped with `allowedNamePrefix` — to the plugin's flattened name (e.g. `@data-fair-processing-gpkg`) — covers both tag and branch flows
- [ ] Publish job restricted to tag pushes on protected branches
- [ ] **GitHub: secret stored in an environment (not repository level) with required reviewers**
- [ ] **GitHub: environment restricted to specific branches/tags**
- [ ] GitLab: variable marked as protected + masked
- [ ] Tag creation restricted to maintainers
- [ ] One key per project per registry environment, named descriptively (a plugin publishing to both production and staging needs two keys)
- [ ] Dependencies pinned via lockfile
- [ ] `node_modules` built inside the same base image consumers run on
- [ ] `architecture` form field set on upload (matches `process.arch` of the consumer)
- [ ] Key rotation process documented for your team
