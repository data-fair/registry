/* eslint-disable no-template-curly-in-string */
export default {
  $id: 'https://github.com/data-fair/registry/artefact',
  'x-exports': ['types'],
  'x-vjsf': { xI18n: true },
  'x-vjsf-locales': ['en', 'fr'],
  title: 'Artefact',
  type: 'object',
  additionalProperties: false,
  layout: { title: null },
  required: ['_id', 'name', 'format', 'category', 'createdAt', 'updatedAt'],
  properties: {
    _id: { type: 'string', readOnly: true },
    name: { type: 'string', readOnly: true },
    format: { type: 'string', enum: ['npm', 'file', 'branch'], readOnly: true },
    branchName: { type: 'string', readOnly: true },
    architecture: { type: 'string', readOnly: true },
    latestMajor: {
      type: 'integer',
      readOnly: true,
      description: 'Highest semverMajor across published versions. Maintained on every upload; lets clients pin new processings to the current major without listing versions.'
    },
    packageName: { type: 'string', readOnly: true },
    version: { type: 'string', readOnly: true },
    licence: { type: 'string', readOnly: true },
    category: {
      type: 'string',
      enum: ['processing', 'catalog', 'application', 'tileset', 'maplibre-style', 'other']
    },
    title: {
      type: 'object',
      additionalProperties: false,
      properties: {
        en: {
          type: 'string',
          title: 'Title - English',
          'x-i18n-title': { fr: 'Titre - Anglais' },
          layout: { cols: { md: 6 } }
        },
        fr: {
          type: 'string',
          title: 'Title - French',
          'x-i18n-title': { fr: 'Titre - Français' },
          layout: { cols: { md: 6 } }
        }
      }
    },
    description: {
      type: 'object',
      additionalProperties: false,
      properties: {
        en: {
          type: 'string',
          title: 'Description - English',
          'x-i18n-title': { fr: 'Description - Anglais' },
          layout: {
            comp: 'textarea',
            props: { autoGrow: true, rows: 3 },
            cols: { md: 6 }
          }
        },
        fr: {
          type: 'string',
          title: 'Description - French',
          'x-i18n-title': { fr: 'Description - Français' },
          layout: {
            comp: 'textarea',
            props: { autoGrow: true, rows: 3 },
            cols: { md: 6 }
          }
        }
      }
    },
    group: {
      type: 'object',
      additionalProperties: false,
      properties: {
        en: {
          type: 'string',
          title: 'Group - English',
          'x-i18n-title': { fr: 'Groupe - Anglais' },
          layout: { cols: { md: 6 } }
        },
        fr: {
          type: 'string',
          title: 'Group - French',
          'x-i18n-title': { fr: 'Groupe - Français' },
          layout: { cols: { md: 6 } }
        }
      }
    },
    thumbnail: {
      type: 'object',
      readOnly: true,
      additionalProperties: false,
      required: ['id', 'width', 'height'],
      properties: {
        id: { type: 'string' },
        width: { type: 'integer' },
        height: { type: 'integer' }
      }
    },
    public: {
      type: 'boolean',
      title: 'Public',
      'x-i18n-title': { fr: 'Public' },
      layout: 'switch',
      default: false
    },
    privateAccess: {
      type: 'array',
      title: 'Private access',
      'x-i18n-title': { fr: 'Accès privés' },
      layout: { if: '!parent.data?.public' },
      items: {
        type: 'object',
        title: 'Account',
        'x-i18n-title': { fr: 'Compte' },
        additionalProperties: false,
        required: ['type', 'id', 'name'],
        properties: {
          type: { type: 'string', enum: ['user', 'organization'] },
          id: { type: 'string' },
          name: { type: 'string' }
        },
        layout: {
          getItems: {
            url: '/simple-directory/api/accounts?size=20',
            qSearchParam: 'q',
            itemsResults: 'data.results',
            itemTitle: '`${item.name} (${item.id})`',
            itemKey: '`${item.type}:${item.id}`',
            itemIcon: '`/simple-directory/api/avatars/${item.type}/${item.id}/avatar.png`'
          }
        }
      }
    },
    documentation: {
      type: 'string',
      format: 'uri',
      title: 'Documentation URL',
      'x-i18n-title': { fr: 'URL de documentation' }
    },
    origin: { type: 'string', readOnly: true },
    filePath: { type: 'string', readOnly: true },
    fileName: { type: 'string', readOnly: true },
    size: { type: 'integer', readOnly: true },
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
    },
    createdAt: { type: 'string', format: 'date-time', readOnly: true },
    updatedAt: { type: 'string', format: 'date-time', readOnly: true },
    dataUpdatedAt: { type: 'string', format: 'date-time', readOnly: true }
  }
}
