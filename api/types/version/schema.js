export default {
  $id: 'https://github.com/data-fair/registry/version',
  'x-exports': ['types'],
  title: 'Version',
  type: 'object',
  additionalProperties: false,
  required: ['_id', 'artefactId', 'version', 'semverMajor', 'semverMinor', 'semverPatch', 'tarballPath', 'uploadedAt'],
  properties: {
    _id: { type: 'string', readOnly: true },
    artefactId: { type: 'string', readOnly: true },
    version: { type: 'string', readOnly: true },
    architecture: { type: 'string' },
    semverMajor: { type: 'integer', readOnly: true },
    semverMinor: { type: 'integer', readOnly: true },
    semverPatch: { type: 'integer', readOnly: true },
    semverPrerelease: { type: 'string', readOnly: true },
    tarballPath: { type: 'string', readOnly: true },
    size: { type: 'integer', readOnly: true },
    uploadedAt: { type: 'string', format: 'date-time', readOnly: true },
    uploadedBy: {
      type: 'object',
      readOnly: true,
      additionalProperties: false,
      properties: {
        apiKeyId: { type: 'string' },
        apiKeyName: { type: 'string' },
        shortId: { type: 'string' },
        internal: { type: 'boolean' }
      }
    }
  }
}
