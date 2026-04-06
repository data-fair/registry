export default {
  $id: 'https://github.com/data-fair/registry/api-key-post-req',
  'x-exports': ['validate', 'types'],
  title: 'ApiKey post req',
  type: 'object',
  additionalProperties: false,
  required: ['type', 'name'],
  properties: {
    type: { type: 'string', enum: ['upload', 'federation'] },
    name: { type: 'string', minLength: 1 },
    owner: {
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
