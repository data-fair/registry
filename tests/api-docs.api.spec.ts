/**
 * The OpenAPI document and its agent-facing surface: what `@data-fair/openapi-mcp` generates from the
 * x-agent annotations. `lint: 'error'` refuses a description that contradicts its schema; the golden
 * turns any change to a tool's name, description or schema into a diff a reviewer sees. Regenerate
 * with UPDATE_GOLDEN=1 when the change is intended.
 * The checks on security mirror what data-fair's platform merge refuses (platform-api-docs.ts).
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { load, toolSetSnapshot, toolsForScopes } from '@data-fair/openapi-mcp'
import apiDocs from '../api/contract/api-docs.ts'
import { scopedOperations, scopeDescriptions } from '../api/src/scopes.ts'
import { anonymousAx } from './support/axios.ts'

const goldenPath = path.resolve(import.meta.dirname, 'fixtures/agent-surface.json')
const httpMethods = ['get', 'put', 'post', 'delete', 'patch']

test.describe('api docs', () => {
  test('agent tools load without lint error and match the golden', async () => {
    const toolSet = await load(apiDocs(), { baseUrl: 'http://localhost/registry/api/v1', lint: 'error' })
    expect(toolSet.tools.map(t => t.name)).toEqual(['search_artefacts', 'get_artefact'])
    expect(toolsForScopes(toolSet, ['registry:read']).tools.map(t => t.name)).toEqual(['search_artefacts', 'get_artefact'])
    expect(toolsForScopes(toolSet, ['all:read']).tools.map(t => t.name)).toEqual(['search_artefacts', 'get_artefact'])
    expect(toolsForScopes(toolSet, ['datasets:read']).tools).toEqual([])
    // through JSON: the golden is a file, and an `enum: undefined` left by the generator is not
    const snapshot = JSON.parse(JSON.stringify(toolSetSnapshot(toolSet)))
    if (process.env.UPDATE_GOLDEN) writeFileSync(goldenPath, JSON.stringify(snapshot, null, 2) + '\n')
    expect(snapshot).toEqual(JSON.parse(readFileSync(goldenPath, 'utf8')))
  })

  test('every oauth2 requirement uses a declared scope and only shared or registry schemes', () => {
    const doc: any = apiDocs()
    const schemes = doc.components.securitySchemes
    expect(Object.keys(schemes).sort()).toEqual(['oauth2', 'registryApiKey', 'sdCookie'])
    expect(schemes.sdCookie).toEqual({ type: 'apiKey', in: 'cookie', name: 'id_token' })
    const declared = Object.keys(schemes.oauth2.flows.clientCredentials.scopes)
    const scopedPaths = Object.values(scopedOperations).map(o => `${o.method} ${o.path}`).sort()
    const withOauth2: string[] = []
    for (const [p, item] of Object.entries<any>(doc.paths)) {
      for (const method of httpMethods) {
        const op = item[method]
        if (!op) continue
        for (const requirement of op.security ?? doc.security) {
          for (const [name, scopes] of Object.entries<any>(requirement)) {
            expect(['sdCookie', 'oauth2', 'registryApiKey'], `${method} ${p}`).toContain(name)
            if (name === 'oauth2') for (const scope of scopes) expect(declared, `${method} ${p}`).toContain(scope)
          }
        }
        if ((op.security ?? []).some((r: any) => r.oauth2)) withOauth2.push(`${method} ${p}`)
      }
    }
    expect(withOauth2.sort()).toEqual(scopedPaths)
  })

  test('served document is public, cached and localized', async () => {
    const res = await anonymousAx.get('/api/v1/api-docs.json')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('public, max-age=300')
    expect(res.headers.vary).toContain('Accept-Language')
    const scopesOf = (doc: any) => doc.components.securitySchemes.oauth2.flows.clientCredentials.scopes
    const en = await anonymousAx.get('/api/v1/api-docs.json', { headers: { 'accept-language': 'en' } })
    expect(scopesOf(en.data)['registry:read']).toBe(scopeDescriptions('en')['registry:read'])
    const de = await anonymousAx.get('/api/v1/api-docs.json', { headers: { 'accept-language': 'de' } })
    expect(scopesOf(de.data)['registry:read']).toBe(scopeDescriptions('fr')['registry:read'])
    expect(scopesOf(res.data)['registry:read']).toBe(scopeDescriptions('fr')['registry:read'])
  })
})
