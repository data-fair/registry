export default {
  $id: 'https://github.com/data-fair/registry/remote-registry-patch-req',
  'x-exports': ['validate', 'types'],
  title: 'RemoteRegistry patch req',
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    apiKey: { type: 'string', minLength: 1 }
  }
}
