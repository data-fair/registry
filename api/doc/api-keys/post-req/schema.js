export default {
  $id: 'https://github.com/data-fair/registry/api-key-post-req',
  'x-exports': ['validate', 'types'],
  title: 'ApiKey post req',
  type: 'object',
  additionalProperties: false,
  required: ['type', 'name'],
  properties: {
    type: { type: 'string', enum: ['upload', 'read'] },
    name: { type: 'string', minLength: 1 },
    owner: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'id'],
      properties: {
        type: { type: 'string', enum: ['user', 'organization'] },
        id: { type: 'string' }
      }
    },
    allowedName: {
      type: 'string',
      description: 'Restricts an upload key to a single artefact name (exact match). Only valid for upload keys.',
      minLength: 1
    },
    allowedCategory: {
      type: 'string',
      description: 'Restricts an upload key to a single artefact category. Only valid for upload keys.',
      enum: ['processing', 'catalog', 'application', 'other', 'tileset', 'maplibre-style']
    },
    expiresAt: {
      type: 'string',
      format: 'date-time',
      description: 'Optional expiration timestamp. If omitted, the key does not expire.'
    }
  }
}
