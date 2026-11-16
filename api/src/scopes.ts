// The OAuth-style scope vocabulary registry declares: the registry family with a read tier and its
// bare umbrella, plus the global tier scopes all:read / all:write / all:admin shared by every service
// of the platform. Every route a scoped session may reach is listed in scopedOperations and guarded by
// requireOperationScope; any other route refuses scope-restricted sessions (lib-express).
// The OpenAPI document (api/contract/api-docs.ts) is built from the same table.
// Design: docs/superpowers/specs/2026-11-03-api-doc-scopes-design.md
import type { RequestHandler } from 'express'
import type { ScopeTier } from '@data-fair/lib-common-types/scopes.js'
import { defineScopes } from '@data-fair/lib-common-types/scopes.js'
import { requireScope } from '@data-fair/lib-express/index.js'

export const vocabulary = defineScopes({
  registry: {
    tiers: ['read'],
    descriptions: {
      umbrella: { en: 'All artefact registry scopes', fr: 'Tous les droits sur le registre d\'artefacts' },
      read: {
        en: 'Browse the artefact catalog of the registry: metadata and downloads of the artefacts visible to the account',
        fr: 'Parcourir le catalogue d\'artefacts du registre : métadonnées et téléchargement des artefacts visibles par le compte'
      }
    }
  }
})
export const { acceptedScopes, scopeDescriptions } = vocabulary
export type ScopeFamily = typeof vocabulary.families[number]

export type ScopedOperation = { method: 'get', path: string, family: ScopeFamily, tier: ScopeTier }

// paths are relative to /api/v1, as in the OpenAPI document
export const scopedOperations = {
  listArtefacts: { method: 'get', path: '/artefacts', family: 'registry', tier: 'read' },
  getArtefact: { method: 'get', path: '/artefacts/{id}', family: 'registry', tier: 'read' },
  downloadArtefact: { method: 'get', path: '/artefacts/{id}/download', family: 'registry', tier: 'read' }
} satisfies Record<string, ScopedOperation>

export type ScopedOperationId = keyof typeof scopedOperations

// generic over the route params so that, mounted in front of a handler, it keeps express's inference of
// the path params (req.params.id: string)
export const requireOperationScope = <P = Record<string, string>>(operationId: ScopedOperationId): RequestHandler<P> => {
  const operation: ScopedOperation | undefined = scopedOperations[operationId]
  if (!operation) throw new Error(`unknown scoped operation ${operationId}`)
  return requireScope(acceptedScopes(operation.family, operation.tier)) as unknown as RequestHandler<P>
}
