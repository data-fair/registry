import jsonSchema from '@data-fair/lib-utils/json-schema.js'
import ArtefactSchema from '#types/artefact/schema.js'

const schema = jsonSchema(ArtefactSchema)
  .makePatchSchema(['title', 'description', 'group', 'documentation', 'public', 'privateAccess'])
  .schema

export default {
  ...schema,
  'x-exports': ['validate', 'types', 'vjsf']
}
