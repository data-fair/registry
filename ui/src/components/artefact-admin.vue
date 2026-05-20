<template>
  <div id="artefact-admin">
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

    <!-- Danger zone -->
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
  </div>
</template>

<i18n lang="yaml">
fr:
  thumbnail: Vignette
  pickFile: Choisir une image
  replaceFile: Choisir une nouvelle image
  upload: Téléverser
  replace: Remplacer
  remove: Retirer
  editableMetadata: Métadonnées éditables
  save: Enregistrer
  saved: Modifications enregistrées
  dangerZone: Zone de danger
  deleteArtefact: Supprimer l'artefact
  confirmDeleteTitle: Confirmer la suppression
  confirmDeleteText: "Voulez-vous vraiment supprimer l'artefact \"{name}\" et ses données ?"
  cancel: Annuler
  delete: Supprimer
  deleted: Artefact supprimé
en:
  thumbnail: Thumbnail
  pickFile: Pick an image
  replaceFile: Pick a replacement image
  upload: Upload
  replace: Replace
  remove: Remove
  editableMetadata: Editable Metadata
  save: Save
  saved: Changes saved
  dangerZone: Danger Zone
  deleteArtefact: Delete Artefact
  confirmDeleteTitle: Confirm Deletion
  confirmDeleteText: "Are you sure you want to delete artefact \"{name}\" and its data?"
  cancel: Cancel
  delete: Delete
  deleted: Artefact deleted
</i18n>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { mdiImage } from '@mdi/js'
import type { VjsfOptions } from '@koumoul/vjsf/types.js'
import type { Artefact } from '#api/types'

const { artefact } = defineProps<{ artefact: Artefact }>()
const emit = defineEmits<{ changed: [] }>()

const { t, locale } = useI18n()
const router = useRouter()

const editData = ref<Record<string, any>>({})
const originalEditData = ref('')
const valid = ref(true)
const confirmDelete = ref(false)

const hasDiff = computed(() => JSON.stringify(editData.value) !== originalEditData.value)

const vjsfOptions = computed<Partial<VjsfOptions>>(() => ({
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  readOnlyPropertiesMode: 'hide',
  initialValidation: 'always',
  locale: locale.value,
  xI18n: true
}))

// Re-seed the edit form whenever the artefact is (re)loaded by the parent.
watch(() => artefact, () => {
  editData.value = {
    title: artefact.title || {},
    description: artefact.description || {},
    public: artefact.public ?? false,
    privateAccess: artefact.privateAccess ? [...artefact.privateAccess] : []
  }
  originalEditData.value = JSON.stringify(editData.value)
}, { immediate: true })

const patchAction = useAsyncAction(
  async () => {
    const body = { ...editData.value }
    if (body.title && !body.title.fr && !body.title.en) body.title = null
    if (body.description && !body.description.fr && !body.description.en) body.description = null
    if (body.privateAccess && body.privateAccess.length === 0) body.privateAccess = null

    await $fetch(`/v1/artefacts/${encodeURIComponent(artefact._id)}`, { method: 'PATCH', body })
    emit('changed')
  },
  { success: t('saved') }
)

const thumbnailFile = ref<File | null>(null)
const thumbnailUrl = computed(() =>
  artefact.thumbnail ? `${$apiPath}/v1/thumbnails/${artefact.thumbnail.id}/data` : null
)

const thumbnailUploadAction = useAsyncAction(
  async () => {
    if (!thumbnailFile.value) return
    const form = new FormData()
    form.append('file', thumbnailFile.value)
    await $fetch(`/v1/artefacts/${encodeURIComponent(artefact._id)}/thumbnail`, { method: 'POST', body: form })
    thumbnailFile.value = null
    emit('changed')
  },
  { success: t('saved') }
)

const thumbnailDeleteAction = useAsyncAction(
  async () => {
    await $fetch(`/v1/artefacts/${encodeURIComponent(artefact._id)}/thumbnail`, { method: 'DELETE' })
    emit('changed')
  },
  { success: t('saved') }
)

const deleteAction = useAsyncAction(
  async () => {
    await $fetch(`/v1/artefacts/${encodeURIComponent(artefact._id)}`, { method: 'DELETE' })
    router.push('/')
  },
  { success: t('deleted') }
)
</script>
