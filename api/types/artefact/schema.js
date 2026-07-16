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
    packageName: { type: 'string', readOnly: true },
    version: { type: 'string', readOnly: true },
    licence: { type: 'string', readOnly: true },
    category: {
      type: 'string',
      enum: ['processing', 'catalog', 'application', 'tileset', 'maplibre-style', 'other']
    },
    // Mirror-aware visibility (driven by the admin form's VJSF context):
    //   context.mirrored   -> artefact is mirrored from a remote registry
    //   context.accessOnly -> this form instance edits only local access
    //                         (public / privateAccess)
    // Remote-owned fields are shown read-only in the metadata section and
    // hidden from the access-only section; public/privateAccess are the
    // inverse. Both context flags are absent (falsy) for a normal,
    // non-mirrored artefact, so the single form shows everything.
    title: {
      type: 'object',
      additionalProperties: false,
      layout: { if: '!context.accessOnly' },
      properties: {
        en: { type: 'string', title: 'Title - English', 'x-i18n-title': { fr: 'Titre - Anglais' }, layout: { cols: { md: 6 } } },
        fr: { type: 'string', title: 'Title - French', 'x-i18n-title': { fr: 'Titre - Français' }, layout: { cols: { md: 6 } } }
      }
    },
    description: {
      type: 'object',
      additionalProperties: false,
      layout: { if: '!context.accessOnly' },
      properties: {
        en: { type: 'string', title: 'Description - English', 'x-i18n-title': { fr: 'Description - Anglais' }, layout: { comp: 'textarea', props: { autoGrow: true, rows: 3 }, cols: { md: 6 } } },
        fr: { type: 'string', title: 'Description - French', 'x-i18n-title': { fr: 'Description - Français' }, layout: { comp: 'textarea', props: { autoGrow: true, rows: 3 }, cols: { md: 6 } } }
      }
    },
    group: {
      type: 'object',
      additionalProperties: false,
      layout: { if: '!context.accessOnly' },
      properties: {
        en: {
          type: 'string',
          title: 'Group - English',
          'x-i18n-title': { fr: 'Groupe - Anglais' },
          layout: {
            comp: 'combobox',
            cols: { md: 6 },
            getItems: {
              url: '${context.apiPath}/v1/artefacts/groups?category=${context.category}&locale=en',
              itemsResults: 'data.results'
            }
          }
        },
        fr: {
          type: 'string',
          title: 'Group - French',
          'x-i18n-title': { fr: 'Groupe - Français' },
          layout: {
            comp: 'combobox',
            cols: { md: 6 },
            getItems: {
              url: '${context.apiPath}/v1/artefacts/groups?category=${context.category}&locale=fr',
              itemsResults: 'data.results'
            }
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
    deprecated: {
      type: 'boolean',
      title: 'Deprecated',
      'x-i18n-title': { fr: 'Déprécié' },
      layout: { comp: 'switch', if: '!context.accessOnly' },
      default: false
    },
    public: {
      type: 'boolean',
      title: 'Public',
      'x-i18n-title': { fr: 'Public' },
      layout: { comp: 'switch', if: 'context.accessOnly || !context.mirrored' },
      default: false
    },
    privateAccess: {
      type: 'array',
      title: 'Private access',
      'x-i18n-title': { fr: 'Accès privés' },
      layout: { if: '(context.accessOnly || !context.mirrored) && !parent.data?.public' },
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
      'x-i18n-title': { fr: 'URL de documentation' },
      layout: { if: '!context.accessOnly' }
    },
    origin: { type: 'string', readOnly: true },
    // `fileName` is only used by format=file.
    fileName: { type: 'string', readOnly: true },
    size: { type: 'integer', readOnly: true },
    // Path to the artefact's primary blob in files-storage. For npm,
    // the tarball; for file, the uploaded file. Renamed from filePath
    // for npm/file symmetry.
    path: { type: 'string', readOnly: true },
    // True iff the npm tarball contains compiled .node binaries, a
    // binding.gyp, a prebuilds/ directory, or an install/preinstall/
    // postinstall script that references node-gyp / prebuild-install /
    // node-gyp-build / node-pre-gyp. Set at upload time; consumers
    // (lib-node) use it to decide whether to run `npm rebuild` after
    // extraction.
    hasNativeModules: { type: 'boolean', readOnly: true },
    // Advisory vulnerability-scan summary. Admin-only: stripped from
    // responses for non-admin callers in the artefacts router. Full
    // findings live in the separate `artefactScans` collection.
    scan: {
      type: 'object',
      readOnly: true,
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ['pending', 'running', 'success', 'error'] },
        queuedAt: { type: 'string', format: 'date-time' },
        startedAt: { type: 'string', format: 'date-time' },
        finishedAt: { type: 'string', format: 'date-time' },
        scannerVersion: { type: 'string' },
        vulnDbUpdatedAt: { type: 'string', format: 'date-time' },
        hasInstallScripts: { type: 'boolean' },
        error: { type: 'string' },
        summary: {
          type: 'object',
          additionalProperties: false,
          properties: {
            critical: { type: 'integer' },
            high: { type: 'integer' },
            medium: { type: 'integer' },
            low: { type: 'integer' },
            unknown: { type: 'integer' },
            total: { type: 'integer' }
          }
        }
      }
    },
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
