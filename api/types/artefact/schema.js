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
    format: { type: 'string', enum: ['npm', 'file'], readOnly: true },
    majorVersion: { type: 'integer', readOnly: true },
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
        discriminator: { propertyName: 'type' },
        oneOfLayout: { emptyData: true },
        oneOf: [
          {
            title: 'Organization',
            'x-i18n-title': { fr: 'Organisation' },
            required: ['type', 'id'],
            additionalProperties: false,
            properties: {
              type: { type: 'string', const: 'organization' },
              id: {
                type: 'string',
                title: 'Organization',
                'x-i18n-title': { fr: 'Organisation' },
                layout: {
                  getItems: {
                    url: '/simple-directory/api/organizations?size=20',
                    qSearchParam: 'q',
                    itemsResults: 'data.results',
                    itemTitle: '`${item.name} (${item.id})`',
                    itemValue: 'item.id',
                    itemIcon: '`/simple-directory/api/avatars/organization/${item.id}/avatar.png`'
                  }
                }
              }
            }
          },
          {
            title: 'User',
            'x-i18n-title': { fr: 'Utilisateur' },
            required: ['type', 'id'],
            additionalProperties: false,
            properties: {
              type: { type: 'string', const: 'user' },
              id: {
                type: 'string',
                title: 'User',
                'x-i18n-title': { fr: 'Utilisateur' },
                layout: {
                  getItems: {
                    url: '/simple-directory/api/users?size=20',
                    qSearchParam: 'q',
                    itemsResults: 'data.results',
                    itemTitle: '`${item.name} (${item.id})`',
                    itemValue: 'item.id',
                    itemIcon: '`/simple-directory/api/avatars/user/${item.id}/avatar.png`'
                  }
                }
              }
            }
          }
        ]
      }
    },
    processingConfigSchema: { type: 'object', layout: { comp: 'none' } },
    applicationConfigSchema: { type: 'object', layout: { comp: 'none' } },
    origin: { type: 'string', readOnly: true },
    filePath: { type: 'string', readOnly: true },
    fileName: { type: 'string', readOnly: true },
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
    updatedAt: { type: 'string', format: 'date-time', readOnly: true }
  }
}
