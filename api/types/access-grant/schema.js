export default {
  $id: 'https://github.com/data-fair/registry/access-grant',
  'x-exports': ['types'],
  title: 'AccessGrant',
  type: 'object',
  additionalProperties: false,
  required: ['_id', 'account', 'grantedBy', 'grantedAt'],
  properties: {
    _id: { type: 'string', readOnly: true },
    account: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'id'],
      properties: {
        type: { type: 'string', enum: ['user', 'organization'] },
        id: { type: 'string' }
      }
    },
    grantedBy: {
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
    grantedAt: { type: 'string', format: 'date-time', readOnly: true }
  }
}
