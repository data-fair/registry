export default {
  $id: 'https://github.com/data-fair/registry/remote-registry-post-req',
  'x-exports': ['validate', 'types'],
  title: 'RemoteRegistry post req',
  type: 'object',
  additionalProperties: false,
  required: ['url', 'name', 'apiKey'],
  properties: {
    url: { type: 'string', pattern: '^https?://' },
    name: { type: 'string', minLength: 1 },
    apiKey: { type: 'string', minLength: 1 }
  }
}
