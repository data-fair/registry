<template>
  <v-container
    v-if="artefact"
    data-iframe-height
  >
    <!-- Mirror banner -->
    <v-alert
      v-if="artefact.origin"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      {{ t('mirroredFrom', { origin: artefact.origin }) }}
    </v-alert>

    <!-- Manifest metadata (read-only) -->
    <v-card class="mb-4">
      <v-card-title>{{ t('manifest') }}</v-card-title>
      <v-card-text>
        <v-row>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <div class="text-medium-emphasis text-body-2">
              {{ t('packageName') }}
            </div>
            <div>{{ artefact.packageName }}</div>
          </v-col>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <div class="text-medium-emphasis text-body-2">
              {{ t('latestVersion') }}
            </div>
            <div>{{ artefact.version }}</div>
          </v-col>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <div class="text-medium-emphasis text-body-2">
              {{ t('licence') }}
            </div>
            <div>{{ artefact.licence || '-' }}</div>
          </v-col>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <div class="text-medium-emphasis text-body-2">
              {{ t('category') }}
            </div>
            <v-chip
              size="small"
              :color="categoryColor(artefact.category)"
            >
              {{ categoryLabel(artefact.category, locale) }}
            </v-chip>
          </v-col>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <div class="text-medium-emphasis text-body-2">
              {{ t('created') }}
            </div>
            <div>{{ dayjs(artefact.createdAt).format('L LT') }}</div>
          </v-col>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <div class="text-medium-emphasis text-body-2">
              {{ t('updated') }}
            </div>
            <div>{{ dayjs(artefact.updatedAt).format('L LT') }}</div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Thumbnail -->
    <v-card
      v-if="!artefact.origin"
      class="mb-4"
    >
      <v-card-title>{{ t('thumbnail') }}</v-card-title>
      <v-card-text>
        <div
          v-if="artefact.thumbnail"
          class="mb-3"
        >
          <img
            :src="thumbnailUrl!"
            :width="artefact.thumbnail.width"
            :height="artefact.thumbnail.height"
            :style="{ maxWidth: '100%', height: 'auto', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '4px' }"
            alt=""
          >
        </div>
        <v-file-input
          v-model="thumbnailFile"
          accept="image/*"
          :label="artefact.thumbnail ? t('replaceFile') : t('pickFile')"
          density="compact"
          hide-details
          variant="outlined"
          class="mb-3"
          :prepend-icon="mdiImage"
        />
        <div class="d-flex ga-2">
          <v-btn
            color="primary"
            variant="flat"
            :disabled="!thumbnailFile"
            :loading="thumbnailUploadAction.loading.value"
            @click="thumbnailUploadAction.execute()"
          >
            {{ artefact.thumbnail ? t('replace') : t('upload') }}
          </v-btn>
          <v-btn
            v-if="artefact.thumbnail"
            color="error"
            variant="text"
            :loading="thumbnailDeleteAction.loading.value"
            @click="thumbnailDeleteAction.execute()"
          >
            {{ t('remove') }}
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Editable metadata (VJSF) -->
    <v-card class="mb-4">
      <v-card-title>{{ t('editableMetadata') }}</v-card-title>
      <v-card-text>
        <v-form v-model="valid">
          <vjsf-patch-req
            v-model="editData"
            :locale="locale"
            :options="vjsfOptions"
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!valid || !hasDiff"
          :loading="patchAction.loading.value"
          @click="patchAction.execute()"
        >
          {{ t('save') }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <!-- Version list -->
    <v-card class="mb-4">
      <v-card-title>
        {{ t('versions') }}
        <span class="text-medium-emphasis text-body-2 ml-2">({{ versions.length }})</span>
      </v-card-title>
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t('version') }}</th>
            <th>{{ t('architecture') }}</th>
            <th>{{ t('uploadedAt') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="v in versions"
            :key="v._id"
          >
            <td>
              <code>{{ v.version }}</code>
              <v-chip
                v-if="v.semverPrerelease"
                size="x-small"
                color="orange"
                class="ml-2"
              >
                pre
              </v-chip>
            </td>
            <td>{{ v.architecture || '-' }}</td>
            <td>{{ dayjs(v.uploadedAt).format('L LT') }}</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Delete -->
    <v-card
      v-if="!artefact.origin"
      color="error"
      variant="outlined"
    >
      <v-card-title>{{ t('dangerZone') }}</v-card-title>
      <v-card-text>
        <v-btn
          color="error"
          variant="flat"
          :loading="deleteAction.loading.value"
          @click="confirmDelete = true"
        >
          {{ t('deleteArtefact') }}
        </v-btn>
      </v-card-text>
    </v-card>

    <v-dialog
      v-model="confirmDelete"
      max-width="400"
    >
      <v-card>
        <v-card-title>{{ t('confirmDeleteTitle') }}</v-card-title>
        <v-card-text>{{ t('confirmDeleteText', { name: artefact.name }) }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="confirmDelete = false">
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="deleteAction.loading.value"
            @click="deleteAction.execute()"
          >
            {{ t('delete') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>

  <v-container v-else-if="fetchLoading">
    <v-skeleton-loader type="card, card, card" />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  admin: Administration
  artefacts: Artefacts
  thumbnail: Vignette
  pickFile: Choisir une image
  replaceFile: Choisir une nouvelle image
  upload: Téléverser
  replace: Remplacer
  remove: Retirer
  manifest: Métadonnées du manifeste
  packageName: Nom du paquet
  latestVersion: Dernière version
  licence: Licence
  category: Catégorie
  created: Créé le
  updated: Mis à jour le
  editableMetadata: Métadonnées éditables
  save: Enregistrer
  versions: Versions
  version: Version
  architecture: Architecture
  uploadedAt: Téléversé le
  dangerZone: Zone de danger
  deleteArtefact: Supprimer l'artefact
  confirmDeleteTitle: Confirmer la suppression
  confirmDeleteText: "Voulez-vous vraiment supprimer l'artefact \"{name}\" et toutes ses versions ?"
  cancel: Annuler
  delete: Supprimer
  deleted: Artefact supprimé
  saved: Modifications enregistrées
  mirroredFrom: "Cet artefact est un miroir du registre distant : {origin}"
en:
  admin: Administration
  artefacts: Artefacts
  thumbnail: Thumbnail
  pickFile: Pick an image
  replaceFile: Pick a replacement image
  upload: Upload
  replace: Replace
  remove: Remove
  manifest: Manifest Metadata
  packageName: Package Name
  latestVersion: Latest Version
  licence: Licence
  category: Category
  created: Created
  updated: Updated
  editableMetadata: Editable Metadata
  save: Save
  versions: Versions
  version: Version
  architecture: Architecture
  uploadedAt: Uploaded
  dangerZone: Danger Zone
  deleteArtefact: Delete Artefact
  confirmDeleteTitle: Confirm Deletion
  confirmDeleteText: "Are you sure you want to delete artefact \"{name}\" and all its versions?"
  cancel: Cancel
  delete: Delete
  deleted: Artefact deleted
  saved: Changes saved
  mirroredFrom: "This artefact is mirrored from remote registry: {origin}"
</i18n>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { mdiImage } from '@mdi/js'
import { useBreadcrumbs } from '~/composables/breadcrumbs'
import type { VjsfOptions } from '@koumoul/vjsf/types.js'
import type { Artefact, Version } from '#api/types'

const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute('/admin/artefacts/[id]')
const session = useSession()
const { dayjs } = useLocaleDayjs()

if (!session.state.user?.adminMode) {
  throw new Error('Admin mode required')
}

const artefactId = computed(() => decodeURIComponent(route.params.id as string))

const artefact = ref<Artefact | null>(null)
const versions = ref<Version[]>([])

useBreadcrumbs().setForPage(() => [
  { title: t('admin'), disabled: true },
  { title: t('artefacts'), to: '/admin/artefacts' },
  { title: (artefact.value?.title as any)?.[locale.value] || artefact.value?.name || artefactId.value, disabled: true }
])
const editData = ref<Record<string, any>>({})
const originalEditData = ref<string>('')
const valid = ref(true)
const confirmDelete = ref(false)
const fetchLoading = ref(true)

const hasDiff = computed(() => {
  return JSON.stringify(editData.value) !== originalEditData.value
})

const vjsfOptions = computed<Partial<VjsfOptions>>(() => ({
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  readOnlyPropertiesMode: 'hide',
  initialValidation: 'always',
  locale: locale.value,
  xI18n: true
}))

async function fetchArtefact () {
  fetchLoading.value = true
  try {
    const data = await $fetch(`/v1/artefacts/${encodeURIComponent(artefactId.value)}`)
    artefact.value = data
    versions.value = data.versions || []
    editData.value = {
      title: data.title || {},
      description: data.description || {},
      public: data.public ?? false,
      privateAccess: data.privateAccess ? [...data.privateAccess] : []
    }
    originalEditData.value = JSON.stringify(editData.value)
  } finally {
    fetchLoading.value = false
  }
}

onMounted(fetchArtefact)

const patchAction = useAsyncAction(
  async () => {
    const body = { ...editData.value }
    if (body.title && !body.title.fr && !body.title.en) body.title = null
    if (body.description && !body.description.fr && !body.description.en) body.description = null
    if (body.privateAccess && body.privateAccess.length === 0) body.privateAccess = null

    await $fetch(`/v1/artefacts/${encodeURIComponent(artefactId.value)}`, {
      method: 'PATCH',
      body
    })
    await fetchArtefact()
  },
  { success: t('saved') }
)

const thumbnailFile = ref<File | null>(null)
const thumbnailUrl = computed(() => {
  return artefact.value?.thumbnail
    ? `${$apiPath}/v1/thumbnails/${artefact.value.thumbnail.id}/data`
    : null
})

const thumbnailUploadAction = useAsyncAction(
  async () => {
    if (!thumbnailFile.value) return
    const form = new FormData()
    form.append('file', thumbnailFile.value)
    await $fetch(`/v1/artefacts/${encodeURIComponent(artefactId.value)}/thumbnail`, {
      method: 'POST',
      body: form
    })
    thumbnailFile.value = null
    await fetchArtefact()
  },
  { success: t('saved') }
)

const thumbnailDeleteAction = useAsyncAction(
  async () => {
    await $fetch(`/v1/artefacts/${encodeURIComponent(artefactId.value)}/thumbnail`, {
      method: 'DELETE'
    })
    await fetchArtefact()
  },
  { success: t('saved') }
)

const deleteAction = useAsyncAction(
  async () => {
    await $fetch(`/v1/artefacts/${encodeURIComponent(artefactId.value)}`, {
      method: 'DELETE'
    })
    router.push('/admin/artefacts')
  },
  { success: t('deleted') }
)
</script>
