/**
 * The OpenAPI document of this service, served at /registry/api/v1/api-docs.json.
 *
 * The x-agent annotations turn it into agent tools through `@data-fair/openapi-mcp`. data-fair fetches
 * this document over a private url and merges it into its platform document (paths under
 * /registry/api/v1, tools prefixed registry_), so agents of the deployment can browse the artefact
 * catalog of the active account.
 *
 * The oauth2 scheme declares the scopes registry enforces (api/src/scopes.ts). Each browsing operation
 * lists every scope it accepts as its own security alternative (standard OpenAPI: the scopes of one
 * requirement are all needed). Every other operation is reachable by a session cookie (or registry's
 * own API keys) only: scoped sessions are refused there.
 *
 * Constraints of the platform merge (data-fair api/contract/platform-api-docs.ts): sdCookie and oauth2
 * are the platform's shared schemes and must keep their exact definitions; registry's own `x-api-key`
 * is declared under another name (registryApiKey), which the merge drops.
 *
 * The agent-facing surface this produces is pinned by tests/fixtures/agent-surface.json.
 * Design: docs/superpowers/specs/2026-11-03-api-doc-scopes-design.md
 */
import type { AgentOperation } from '@data-fair/openapi-mcp'
import { oauth2SecurityScheme, oauth2Alternatives, type ScopeLocale } from '@data-fair/lib-common-types/scopes.js'
import artefactSchema from '../types/artefact/schema.js'
import { vocabulary, acceptedScopes, scopedOperations, type ScopedOperationId } from '../src/scopes.ts'

const categories = artefactSchema.properties.category.enum
const formats = artefactSchema.properties.format.enum
// the `sort` keys of the artefacts router; public and vulnerabilities are ignored for non-admins
const sortKeys = ['dataUpdatedAt', 'name', 'category', 'group.en', 'group.fr', 'version', 'size', 'public', 'vulnerabilities']
const withDesc = (keys: string[]) => keys.flatMap(key => [key, '-' + key])

/** the artefact type schema without its form annotations (vjsf layout, i18n titles, ids) */
const cleanSchema = (value: any): any => {
  if (Array.isArray(value)) return value.map(cleanSchema)
  if (typeof value !== 'object' || value === null) return value
  const cleaned: Record<string, any> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === 'layout' || key === '$id' || key.startsWith('x-')) continue
    // a property named like a keyword is still a property: only clean the schemas below `properties`
    cleaned[key] = key === 'properties'
      ? Object.fromEntries(Object.entries(child as Record<string, any>).map(([name, schema]) => [name, cleanSchema(schema)]))
      : cleanSchema(child)
  }
  return cleaned
}
const artefact = cleanSchema(artefactSchema)
artefact.description = 'A plugin or file hosted by the registry. The scan field is only returned to superadmins.'

export const searchArtefacts: AgentOperation = {
  name: 'search_artefacts',
  title: { en: 'Search artefacts', fr: 'Rechercher des artefacts' },
  description: {
    en: 'Search the artefact catalog of the registry: plugins distributed as npm packages (processings, catalog connectors, applications, agent skills) and files (map tilesets, map styles). Only the artefacts visible to the active account are returned: public ones and those shared with it. Deprecated artefacts are hidden unless includeDeprecated is true. Use get_artefact for the full metadata of one artefact.',
    fr: 'Rechercher dans le catalogue d\'artefacts du registre : plugins distribués comme paquets npm (traitements, connecteurs de catalogues, applications, compétences d\'agents) et fichiers (tuiles cartographiques, styles de cartes). Seuls les artefacts visibles par le compte actif sont retournés : les publics et ceux partagés avec lui. Les artefacts dépréciés sont masqués sauf si includeDeprecated vaut true. Utiliser get_artefact pour les métadonnées complètes d\'un artefact.'
  },
  annotations: { readOnlyHint: true },
  params: {
    q: { description: 'Full-text search on the artefact name, title, group and description.' },
    category: { description: 'Restrict to one category.' },
    format: { description: 'npm for packages, file for raw files.' },
    // the admin-only keys are ignored for the accounts agents act for
    sort: { enum: withDesc(sortKeys.filter(key => key !== 'public' && key !== 'vulnerabilities')), description: 'Sort key, prefixed with - for a descending order. Defaults to the most recently updated first.' },
    size: { default: 10, maximum: 100, description: 'Maximum number of artefacts. The response count says how many match in total.' }
  },
  response: {
    rows: '/results',
    concise: ['_id', 'title', 'category', 'format', 'version', 'deprecated'],
    detailed: ['_id', 'name', 'title', 'description', 'category', 'group', 'format', 'packageName', 'version', 'licence', 'documentation', 'deprecated', 'public', 'dataUpdatedAt']
  }
}

export const getArtefact: AgentOperation = {
  name: 'get_artefact',
  title: { en: 'Get an artefact', fr: 'Lire un artefact' },
  description: {
    en: 'Read the metadata of one artefact of the registry by its id (as returned by search_artefacts): title, description, category, version, licence, documentation link. Not found when the active account cannot see it.',
    fr: 'Lire les métadonnées d\'un artefact du registre par son identifiant (tel que retourné par search_artefacts) : titre, description, catégorie, version, licence, lien de documentation. Introuvable quand le compte actif ne peut pas le voir.'
  },
  annotations: { readOnlyHint: true }
}

// the security of a browsing operation: the cookie session, a token holding one of the scopes it
// accepts, or a registry read API key
const operationSecurity = (operationId: ScopedOperationId) => {
  const { family, tier } = scopedOperations[operationId]
  return [{ sdCookie: [] }, ...oauth2Alternatives(acceptedScopes(family, tier)), { registryApiKey: [] }]
}

const idParam = { in: 'path', name: 'id', required: true, description: 'Id of the artefact, e.g. @data-fair/processing-gpkg@1.', schema: { type: 'string' } }
const registryIdParam = { in: 'path', name: 'id', required: true, description: 'Id of the remote registry.', schema: { type: 'string' } }
const errors = {
  400: { description: 'Invalid request.' },
  401: { description: 'Not authenticated.' },
  403: { description: 'Not allowed, or a scope-restricted session on a route it cannot reach.' }
}

/** a route documented for reference: summary only, reachable by a session cookie (no scoped session) */
const sessionOp = (tag: string, summary: string, description?: string) => ({
  tags: [tag],
  summary,
  ...(description ? { description } : {}),
  security: [{ sdCookie: [] }],
  responses: { 200: { description: 'Success.' }, ...errors }
})
const adminOp = (tag: string, summary: string) => sessionOp(tag, summary, 'Superadmin only (admin mode).')

const uploadOp = (summary: string, description: string, fields: Record<string, any>, pathParam: Record<string, any>) => ({
  tags: ['Upload'],
  summary,
  description,
  security: [{ registryApiKey: [] }],
  parameters: [pathParam],
  requestBody: {
    required: true,
    content: {
      'multipart/form-data': {
        schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' }, ...fields } }
      }
    }
  },
  responses: {
    201: { description: 'The artefact.', content: { 'application/json': { schema: { type: 'object', properties: { artefact: { $ref: '#/components/schemas/artefact' } } } } } },
    ...errors,
    409: { description: 'The artefact is mirrored from a remote registry, or exists with another format or package name.' },
    413: { description: 'The upload is too large.' }
  }
})

export default (locale: ScopeLocale = 'fr') => ({
  openapi: '3.1.0',
  info: {
    title: 'API Registry',
    description: 'The registry of the data-fair platform: it stores plugin definitions (npm packages) and files (map tilesets and styles) and serves them to the services and accounts allowed to use them.',
    version: '1.0.0'
  },
  // no request origin: data-fair fetches this document over a private url and prefixes the paths itself
  servers: [{ url: '/registry/api/v1' }],
  components: {
    securitySchemes: {
      sdCookie: { type: 'apiKey', in: 'cookie', name: 'id_token' },
      // relative token url, data-fair sets the one of each site
      oauth2: oauth2SecurityScheme(vocabulary, { directoryUrl: '/simple-directory', locale }),
      // registry's own API keys: upload keys, and read keys of remote registries mirroring this one
      registryApiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' }
    },
    schemas: { artefact }
  },
  security: [{ sdCookie: [] }],
  tags: [
    { name: 'Artefacts', description: 'The artefact catalog: plugins and files hosted by the registry.' },
    { name: 'Upload', description: 'Publishing artefacts with an upload API key.' },
    { name: 'API keys', description: 'Upload keys (superadmin) and read keys (account admins, for remote registries).' },
    { name: 'Access grants', description: 'Accounts allowed to download artefacts.' },
    { name: 'Remote registries', description: 'Mirroring artefacts from other registries.' },
    { name: 'Thumbnails', description: 'Images illustrating the artefacts.' }
  ],
  paths: {
    '/artefacts': {
      get: {
        operationId: 'listArtefacts',
        tags: ['Artefacts'],
        summary: 'List artefacts',
        description: 'The artefacts visible to the caller: public ones and those shared with its account (all of them for a superadmin).',
        security: operationSecurity('listArtefacts'),
        'x-agent': searchArtefacts,
        parameters: [
          { in: 'query', name: 'q', required: false, description: 'Full-text search.', schema: { type: 'string' } },
          { in: 'query', name: 'category', required: false, description: 'Category of the artefacts.', schema: { type: 'string', enum: categories } },
          { in: 'query', name: 'format', required: false, description: 'Format of the artefacts.', schema: { type: 'string', enum: formats } },
          { in: 'query', name: 'includeDeprecated', required: false, description: 'Include the deprecated artefacts.', schema: { type: 'boolean', default: false } },
          { in: 'query', name: 'sort', required: false, description: 'Sort key, prefixed with - for a descending order. public and vulnerabilities are ignored for non-admins.', schema: { type: 'string', enum: withDesc(sortKeys) } },
          { in: 'query', name: 'size', required: false, description: 'Page size.', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
          { in: 'query', name: 'skip', required: false, description: 'Number of artefacts to skip.', schema: { type: 'integer', minimum: 0, maximum: 100000, default: 0 } }
        ],
        responses: {
          200: {
            description: 'A page of artefacts and the total count.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    count: { type: 'integer', description: 'Number of matching artefacts.' },
                    results: { type: 'array', items: { $ref: '#/components/schemas/artefact' } }
                  }
                }
              }
            }
          },
          ...errors
        }
      }
    },
    '/artefacts/{id}': {
      get: {
        operationId: 'getArtefact',
        tags: ['Artefacts'],
        summary: 'Read an artefact',
        security: operationSecurity('getArtefact'),
        'x-agent': getArtefact,
        parameters: [idParam],
        responses: {
          200: { description: 'The artefact.', content: { 'application/json': { schema: { $ref: '#/components/schemas/artefact' } } } },
          ...errors,
          404: { description: 'Not found, or not visible to the caller.' }
        }
      },
      patch: { ...adminOp('Artefacts', 'Edit the metadata of an artefact'), parameters: [idParam] },
      delete: { ...adminOp('Artefacts', 'Delete an artefact'), parameters: [idParam] }
    },
    '/artefacts/{id}/download': {
      get: {
        operationId: 'downloadArtefact',
        tags: ['Artefacts'],
        summary: 'Download an artefact',
        description: 'The npm tarball or the raw file. Needs an account holding an access grant (or a superadmin). npm artefacts carry the X-Artefact-Version and X-Artefact-Has-Native-Modules headers; If-Modified-Since is answered with 304 when the content did not change. A storage backend may answer with a 302 to a signed URL.',
        security: operationSecurity('downloadArtefact'),
        parameters: [idParam, { in: 'header', name: 'If-Modified-Since', required: false, schema: { type: 'string' } }],
        responses: {
          200: { description: 'The content.', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } }, 'application/gzip': { schema: { type: 'string', format: 'binary' } } } },
          302: { description: 'Redirect to a signed download URL.' },
          304: { description: 'Not modified since If-Modified-Since.' },
          ...errors,
          404: { description: 'Not found, or no content uploaded.' }
        }
      }
    },
    '/artefacts/groups': { get: adminOp('Artefacts', 'Distinct group values of a category') },
    '/artefacts/scan-summary': { get: adminOp('Artefacts', 'Fleet-wide vulnerability summary') },
    '/artefacts/{id}/scan': {
      get: { ...adminOp('Artefacts', 'Vulnerability findings of an artefact'), parameters: [idParam] },
      post: { ...adminOp('Artefacts', 'Scan an artefact for vulnerabilities'), parameters: [idParam] }
    },
    '/artefacts/{id}/thumbnail': {
      post: { ...adminOp('Thumbnails', 'Upload the thumbnail of an artefact'), parameters: [idParam] },
      delete: { ...adminOp('Thumbnails', 'Delete the thumbnail of an artefact'), parameters: [idParam] }
    },
    '/thumbnails/{id}/data': {
      get: {
        tags: ['Thumbnails'],
        summary: 'Read a thumbnail image',
        security: [],
        parameters: [{ in: 'path', name: 'id', required: true, description: 'Id of the thumbnail (artefact.thumbnail.id).', schema: { type: 'string' } }],
        responses: { 200: { description: 'The image.' }, 404: { description: 'Not found.' } }
      }
    },
    '/artefacts/npm/{id}': {
      post: uploadOp(
        'Upload an npm artefact',
        'Creates or replaces the npm tarball of an artefact. The id usually is the package name with its major version (e.g. @data-fair/processing-gpkg@1).',
        { category: { type: 'string', enum: ['processing', 'catalog', 'application', 'skill', 'other'] } },
        idParam
      )
    },
    '/artefacts/file/{name}': {
      post: uploadOp(
        'Upload a file artefact',
        'Creates or replaces a raw file artefact.',
        {
          category: { type: 'string', enum: ['tileset', 'maplibre-style', 'other'] },
          fileName: { type: 'string' },
          title: { type: 'string', description: 'JSON object with fr and en keys.' },
          description: { type: 'string', description: 'JSON object with fr and en keys.' }
        },
        { in: 'path', name: 'name', required: true, description: 'Name (and id) of the artefact.', schema: { type: 'string' } }
      )
    },
    '/api-keys': {
      get: sessionOp('API keys', 'List API keys', 'All keys for a superadmin, the read keys of the active account otherwise.'),
      post: sessionOp('API keys', 'Create an API key', 'Upload keys need a superadmin, read keys an admin of an account holding an access grant.')
    },
    '/api-keys/{id}': { delete: { ...sessionOp('API keys', 'Delete an API key'), parameters: [{ ...idParam, description: 'Id of the key.' }] } },
    '/access-grants': {
      get: adminOp('Access grants', 'List access grants'),
      post: adminOp('Access grants', 'Grant an account access')
    },
    '/access-grants/me': { get: sessionOp('Access grants', 'Access grant of the active account') },
    '/access-grants/{id}': { delete: { ...adminOp('Access grants', 'Revoke an access grant'), parameters: [{ ...idParam, description: 'Id of the grant.' }] } },
    '/remote-registries': {
      get: adminOp('Remote registries', 'List remote registries'),
      post: adminOp('Remote registries', 'Register a remote registry')
    },
    '/remote-registries/{id}': {
      parameters: [registryIdParam],
      get: adminOp('Remote registries', 'Read a remote registry'),
      patch: adminOp('Remote registries', 'Edit a remote registry'),
      delete: adminOp('Remote registries', 'Delete a remote registry')
    },
    '/remote-registries/{id}/remote-artefacts': { parameters: [registryIdParam], get: adminOp('Remote registries', 'List the artefacts of a remote registry') },
    '/remote-registries/{id}/selected-artefacts': { parameters: [registryIdParam], post: adminOp('Remote registries', 'Select an artefact to mirror') },
    '/remote-registries/{id}/selected-artefacts/{artefactId}': { parameters: [registryIdParam, { ...idParam, name: 'artefactId' }], delete: adminOp('Remote registries', 'Unselect a mirrored artefact') },
    '/remote-registries/{id}/sync': { parameters: [registryIdParam], post: adminOp('Remote registries', 'Synchronize the mirrored artefacts now') }
  }
})
