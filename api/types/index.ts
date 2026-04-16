import artefactSchema from './artefact/schema.js'
import versionSchema from './version/schema.js'
import apiKeySchema from './api-key/schema.js'
import accessGrantSchema from './access-grant/schema.js'
import remoteRegistrySchema from './remote-registry/schema.js'

export type { Artefact } from './artefact/index.ts'
export type { Version } from './version/index.ts'
export type { ApiKey } from './api-key/index.ts'
export type { AccessGrant } from './access-grant/index.ts'
export type { RemoteRegistry } from './remote-registry/index.ts'
export { artefactSchema, versionSchema, apiKeySchema, accessGrantSchema, remoteRegistrySchema }
