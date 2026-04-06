export default {
  $id: 'https://github.com/data-fair/registry/artefact',
  'x-exports': ['types'],
  title: 'Artefact',
  type: 'object',
  additionalProperties: false,
  required: ['_id', 'name', 'format', 'category', 'createdAt', 'updatedAt'],
  properties: {
    _id: { type: 'string', readOnly: true },
    name: { type: 'string', readOnly: true },
    format: { type: 'string', enum: ['npm', 'file'], readOnly: true },
    majorVersion: { type: 'integer', readOnly: true },
    packageName: { type: 'string', readOnly: true },
    version: { type: 'string', readOnly: true },
    licence: { type: 'string', readOnly: true },
    category: {
      type: 'string',
      enum: ['processing', 'catalog', 'application', 'tileset', 'other']
    },
    title: {
      type: 'object',
      additionalProperties: false,
      properties: {
        fr: { type: 'string' },
        en: { type: 'string' }
      }
    },
    description: {
      type: 'object',
      additionalProperties: false,
      properties: {
        fr: { type: 'string' },
        en: { type: 'string' }
      }
    },
    thumbnail: { type: 'string' },
    public: { type: 'boolean', default: false },
    privateAccess: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'id'],
        properties: {
          type: { type: 'string', enum: ['user', 'organization'] },
          id: { type: 'string' }
        }
      }
    },
    processingConfigSchema: { type: 'object' },
    applicationConfigSchema: { type: 'object' },
    filePath: { type: 'string', readOnly: true },
    fileName: { type: 'string', readOnly: true },
    createdAt: { type: 'string', format: 'date-time', readOnly: true },
    updatedAt: { type: 'string', format: 'date-time', readOnly: true }
  }
}
