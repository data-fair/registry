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
            :width="artefact.thumbnail.width || undefined"
            :height="artefact.thumbnail.height || undefined"
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
        <!-- Mirrored artefacts: the remote registry owns the metadata, so show
             it read-only. Only local access (public / privateAccess) below is
             editable here. -->
        <template v-if="artefact.origin">
          <v-alert
            type="info"
            variant="tonal"
            density="compact"
            class="mb-4"
            :text="t('mirroredNotice')"
          />
          <vjsf-patch-req
            :model-value="readonlyData"
            :locale="locale"
            :options="readonlyVjsfOptions"
          />
        </template>
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
  mirroredNotice: Cet artefact est mirroré depuis un registre distant. Ses métadonnées sont en lecture seule ; seul l'accès local (public / accès privés) est modifiable ici.
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
  mirroredNotice: This artefact is mirrored from a remote registry. Its metadata is read-only; only local access (public / private access) can be edited here.
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
import equal from 'fast-deep-equal'
import { computedDeepDiff } from '@data-fair/lib-vue/deep-diff.js'
import { useLeaveGuard } from '@data-fair/lib-vue/leave-guard.js'
import type { VjsfOptions } from '@koumoul/vjsf/types.js'
import type { Artefact } from '#api/types'

const { artefact } = defineProps<{ artefact: Artefact }>()
const emit = defineEmits<{ changed: [] }>()

const { t, locale } = useI18n()
const router = useRouter()

// Mirrored artefacts: the remote registry owns the metadata. Only `public`
// and `privateAccess` can be patched locally (the API rejects anything else
// with 403), so the editable form is restricted to those fields.
const isMirror = computed(() => !!artefact.origin)

const editData = ref<Record<string, any>>({})
const readonlyData = ref<Record<string, any>>({})
const valid = ref(true)
const confirmDelete = ref(false)

// Build the normalized patch payload from a source (the live form, or the
// saved artefact). The same shape is used both to compute the diff and as the
// PATCH body, so they can never drift. On a mirror only the access fields are
// included — the remote registry owns the rest.
const buildPayload = (src: Record<string, any>) => {
  const payload: Record<string, any> = {
    public: src.public ?? false,
    privateAccess: src.privateAccess?.length ? src.privateAccess : null
  }
  if (isMirror.value) return payload
  payload.title = (src.title?.fr || src.title?.en) ? src.title : null
  payload.description = (src.description?.fr || src.description?.en) ? src.description : null
  payload.group = (src.group?.fr || src.group?.en) ? src.group : null
  payload.documentation = src.documentation || null
  payload.deprecated = src.deprecated ?? false
  return payload
}

// computedDeepDiff keeps the reference stable across VJSF's frequent re-emits
// (it returns the previous value when the new one is deeply equal), so the
// payload only changes identity on a real edit.
const editablePayload = computedDeepDiff(() => buildPayload(editData.value))
const savedPayload = computed(() => buildPayload(artefact))

const hasDiff = computed(() => !equal(editablePayload.value, savedPayload.value))

// Warn before navigating away (route change or tab close) with unsaved edits.
useLeaveGuard(hasDiff, { locale })

const vjsfOptions = computed<Partial<VjsfOptions>>(() => ({
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  readOnlyPropertiesMode: 'hide',
  initialValidation: 'always',
  locale: locale.value,
  xI18n: true,
  // accessOnly mirrors mirrored: on a mirror the editable form shows only the
  // local access fields; on a normal artefact it shows everything.
  context: { category: artefact.category, apiPath: $apiPath, mirrored: isMirror.value, accessOnly: isMirror.value }
}))

// Read-only display of the remote-owned metadata, shown for mirrors only.
const readonlyVjsfOptions = computed<Partial<VjsfOptions>>(() => ({
  ...vjsfOptions.value,
  readOnly: true,
  context: { category: artefact.category, apiPath: $apiPath, mirrored: true, accessOnly: false }
}))

// Re-seed the edit form whenever the artefact is (re)loaded by the parent.
watch(() => artefact, () => {
  editData.value = {
    title: artefact.title || {},
    description: artefact.description || {},
    group: artefact.group || {},
    documentation: artefact.documentation ?? null,
    deprecated: artefact.deprecated ?? false,
    public: artefact.public ?? false,
    privateAccess: artefact.privateAccess ? [...artefact.privateAccess] : []
  }
  // Frozen snapshot for the read-only metadata form (mirrors only); kept
  // separate from editData so the editable access form can never mutate it.
  readonlyData.value = { ...editData.value }
}, { immediate: true })

const patchAction = useAsyncAction(
  async () => {
    // The payload already excludes the remote-owned fields on a mirror, so the
    // API never sees a forbidden key (which it would answer with 403).
    await $fetch(`/v1/artefacts/${encodeURIComponent(artefact._id)}`, { method: 'PATCH', body: editablePayload.value })
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
