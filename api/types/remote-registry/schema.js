export default {
  $id: 'https://github.com/data-fair/registry/remote-registry',
  'x-exports': ['types'],
  title: 'RemoteRegistry',
  type: 'object',
  additionalProperties: false,
  required: ['_id', 'name', 'apiKey', 'apiKeyShortId', 'selectedArtefacts', 'createdAt', 'updatedAt'],
  properties: {
    _id: { type: 'string', description: 'The remote registry base URL' },
    name: { type: 'string' },
    apiKey: {
      type: 'object',
      additionalProperties: false,
      required: ['iv', 'alg', 'data'],
      properties: {
        iv: { type: 'string' },
        alg: { type: 'string', const: 'aes256' },
        data: { type: 'string' }
      }
    },
    apiKeyShortId: { type: 'string' },
    selectedArtefacts: {
      type: 'array',
      items: { type: 'string' }
    },
    lastSyncAt: { type: 'string', format: 'date-time' },
    lastSyncStatus: { type: 'string', enum: ['success', 'error'] },
    lastSyncError: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time', readOnly: true },
    updatedAt: { type: 'string', format: 'date-time', readOnly: true }
  }
}
