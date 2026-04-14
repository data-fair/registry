# CI Integration Guide

This guide covers how to publish artefacts to the registry from GitHub Actions and GitLab CI, with best practices to prevent supply chain attacks.

## API Key Setup

Upload API keys are created by a superadmin in the registry UI. The raw key is displayed **once** at creation time — copy it immediately and store it as a CI secret. It is never retrievable again (only a SHA-512 hash is stored server-side).

## Authentication

All upload requests use the `x-api-key` HTTP header:

```bash
curl -X POST https://registry.example.com/api/v1/artefacts/<name>/versions \
  -H "x-api-key: $REGISTRY_API_KEY" \
  -F file=@package.tgz
```

---

## GitHub Actions

### Storing the secret

**Use environment secrets, not repository secrets** (see [Security Best Practices](#github-actions-understanding-the-threat-model) below).

1. Go to **Settings > Environments** and create an environment (e.g., `production`).
2. Add a required reviewer (deployment protection rule).
3. Optionally restrict to branches/tags (e.g., `main` and `v*`).
4. In the environment, add a secret named `REGISTRY_API_KEY`.

### Workflow example (npm tarball)

```yaml
name: Publish to Registry
on:
  push:
    tags:
      - 'v*'

# IMPORTANT: no permissions needed beyond default read for checkout
permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    # CRITICAL: only run on tag pushes to the default branch
    if: github.ref_type == 'tag' && github.event_name == 'push'
    environment: production  # require manual approval if configured
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npm pack

      - name: Upload to registry
        env:
          REGISTRY_API_KEY: ${{ secrets.REGISTRY_API_KEY }}
        run: |
          TARBALL=$(ls *.tgz)
          PACKAGE_NAME=$(node -p "require('./package.json').name")
          ENCODED_NAME=$(node -p "encodeURIComponent('${PACKAGE_NAME}')")
          curl -f -X POST \
            "https://registry.example.com/api/v1/artefacts/${ENCODED_NAME}/versions" \
            -H "x-api-key: ${REGISTRY_API_KEY}" \
            -F "file=@${TARBALL}"
```

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
      ENCODED_NAME=$(node -p "encodeURIComponent('${PACKAGE_NAME}')")
      curl -f -X POST \
        "${REGISTRY_URL}/api/v1/artefacts/${ENCODED_NAME}/versions" \
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
- [ ] Publish job restricted to tag pushes on protected branches
- [ ] **GitHub: secret stored in an environment (not repository level) with required reviewers**
- [ ] **GitHub: environment restricted to specific branches/tags**
- [ ] GitLab: variable marked as protected + masked
- [ ] Tag creation restricted to maintainers
- [ ] One key per project, named descriptively
- [ ] Dependencies pinned via lockfile
- [ ] Key rotation process documented for your team
