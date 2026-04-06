export default {
  $id: 'https://github.com/data-fair/registry/access-grant-post-req',
  'x-exports': ['validate', 'types'],
  title: 'AccessGrant post req',
  type: 'object',
  additionalProperties: false,
  required: ['account'],
  properties: {
    account: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'id'],
      properties: {
        type: { type: 'string', enum: ['user', 'organization'] },
        id: { type: 'string' }
      }
    }
  }
}
