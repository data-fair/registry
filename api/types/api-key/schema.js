export default {
  $id: 'https://github.com/data-fair/registry/api-key',
  'x-exports': ['types'],
  title: 'ApiKey',
  type: 'object',
  additionalProperties: false,
  required: ['_id', 'type', 'name', 'hashedKey', 'shortId', 'createdBy', 'createdAt'],
  properties: {
    _id: { type: 'string', readOnly: true },
    type: { type: 'string', enum: ['upload', 'read'] },
    name: { type: 'string' },
    hashedKey: { type: 'string', readOnly: true },
    createdBy: {
      type: 'object',
      additionalProperties: false,
      readOnly: true,
      required: ['type', 'id'],
      properties: {
        type: { type: 'string' },
        id: { type: 'string' },
        name: { type: 'string' }
      }
    },
    createdAt: { type: 'string', format: 'date-time', readOnly: true },
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
      description: 'Restricts an upload key to a single artefact name (exact match). Missing means unrestricted.',
      minLength: 1
    },
    allowedCategory: {
      type: 'string',
      description: 'Restricts an upload key to a single artefact category. Missing means unrestricted.',
      enum: ['processing', 'catalog', 'application', 'other', 'tileset', 'maplibre-style']
    },
    shortId: { type: 'string', readOnly: true },
    expiresAt: { type: 'string', format: 'date-time' },
    lastUsedAt: { type: 'string', format: 'date-time', readOnly: true }
  }
}
