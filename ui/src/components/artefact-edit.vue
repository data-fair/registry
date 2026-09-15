<template>
  <v-card
    id="artefact-edit"
    class="mb-4"
  >
    <v-card-title>{{ t('editableMetadata') }}</v-card-title>
    <v-card-text>
      <!-- Thumbnail: staged with the other fields and committed by the same
           Save button, so an admin never loses typed metadata by uploading
           an image first. Mirrors get theirs from the remote registry. -->
      <div
        v-if="!isMirror"
        class="d-flex align-center ga-4 mb-4"
      >
        <div class="thumbnail-slot d-flex align-center justify-center">
          <img
            v-if="previewUrl"
            :src="previewUrl"
            class="thumbnail-preview"
            alt=""
          >
          <v-icon
            v-else
            :icon="mdiImageOutline"
            size="32"
            class="text-medium-emphasis"
          />
        </div>
        <div class="flex-grow-1">
          <v-file-input
            v-model="thumbnailFile"
            accept="image/*"
            :label="artefact.thumbnail ? t('replaceFile') : t('pickFile')"
            variant="outlined"
            :prepend-icon="mdiImage"
          />
          <v-btn
            v-if="artefact.thumbnail && !removeThumbnail"
            color="error"
            variant="text"
            size="small"
            class="mt-1"
            :disabled="!!thumbnailFile"
            @click="removeThumbnail = true"
          >
            {{ t('remove') }}
          </v-btn>
          <div
            v-else-if="removeThumbnail"
            class="text-caption text-medium-emphasis mt-1"
          >
            {{ t('removalPending') }}
            <v-btn
              variant="text"
              size="x-small"
              @click="removeThumbnail = false"
            >
              {{ t('cancel') }}
            </v-btn>
          </div>
        </div>
      </div>

      <!-- Mirrored artefacts: the remote registry owns the metadata, so show
           it read-only. Only local access (public / privateAccess) below is
           editable here. -->
      <template v-if="isMirror">
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
        :loading="saveAction.loading.value"
        @click="saveAction.execute()"
      >
        {{ t('save') }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  editableMetadata: Métadonnées éditables
  pickFile: Choisir une vignette
  replaceFile: Remplacer la vignette
  remove: Retirer la vignette
  removalPending: La vignette sera retirée à l'enregistrement.
  cancel: Annuler
  mirroredNotice: Cet artefact est mirroré depuis un registre distant. Ses métadonnées sont en lecture seule ; seul l'accès local (public / accès privés) est modifiable ici.
  save: Enregistrer
  saved: Modifications enregistrées
en:
  editableMetadata: Editable Metadata
  pickFile: Pick a thumbnail
  replaceFile: Replace the thumbnail
  remove: Remove the thumbnail
  removalPending: The thumbnail will be removed on save.
  cancel: Cancel
  mirroredNotice: This artefact is mirrored from a remote registry. Its metadata is read-only; only local access (public / private access) can be edited here.
  save: Save
  saved: Changes saved
</i18n>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { mdiImage, mdiImageOutline } from '@mdi/js'
import equal from 'fast-deep-equal'
import { computedDeepDiff } from '@data-fair/lib-vue/deep-diff.js'
import { useLeaveGuard } from '@data-fair/lib-vue/leave-guard.js'
import type { VjsfOptions } from '@koumoul/vjsf/types.js'
import type { Artefact } from '#api/types'

const { artefact } = defineProps<{ artefact: Artefact }>()
const emit = defineEmits<{ changed: [] }>()

const { t, locale } = useI18n()

// Mirrored artefacts: the remote registry owns the metadata. Only `public`
// and `privateAccess` can be patched locally (the API rejects anything else
// with 403), so the editable form is restricted to those fields.
const isMirror = computed(() => !!artefact.origin)

const editData = ref<Record<string, any>>({})
const readonlyData = ref<Record<string, any>>({})
const valid = ref(true)

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
const hasMetadataDiff = computed(() => !equal(editablePayload.value, savedPayload.value))

// --- thumbnail staging ---
const thumbnailFile = ref<File | null>(null)
const removeThumbnail = ref(false)
const hasThumbnailDiff = computed(() => !!thumbnailFile.value || removeThumbnail.value)

const savedThumbnailUrl = computed(() =>
  artefact.thumbnail ? `${$apiPath}/v1/thumbnails/${artefact.thumbnail.id}/data` : null
)
// Object URL for the picked file; revoked whenever it is replaced or dropped.
const pickedUrl = ref<string | null>(null)
watch(thumbnailFile, (file) => {
  if (pickedUrl.value) URL.revokeObjectURL(pickedUrl.value)
  pickedUrl.value = file ? URL.createObjectURL(file) : null
  if (file) removeThumbnail.value = false
})
onBeforeUnmount(() => { if (pickedUrl.value) URL.revokeObjectURL(pickedUrl.value) })
const previewUrl = computed(() => pickedUrl.value ?? (removeThumbnail.value ? null : savedThumbnailUrl.value))

const hasDiff = computed(() => hasMetadataDiff.value || hasThumbnailDiff.value)

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
  thumbnailFile.value = null
  removeThumbnail.value = false
}, { immediate: true })

const saveAction = useAsyncAction(
  async () => {
    const id = encodeURIComponent(artefact._id)
    // The payload already excludes the remote-owned fields on a mirror, so the
    // API never sees a forbidden key (which it would answer with 403).
    if (hasMetadataDiff.value) {
      await $fetch(`/v1/artefacts/${id}`, { method: 'PATCH', body: editablePayload.value })
    }
    if (thumbnailFile.value) {
      const form = new FormData()
      form.append('file', thumbnailFile.value)
      await $fetch(`/v1/artefacts/${id}/thumbnail`, { method: 'POST', body: form })
    } else if (removeThumbnail.value) {
      await $fetch(`/v1/artefacts/${id}/thumbnail`, { method: 'DELETE' })
    }
    emit('changed')
  },
  { success: t('saved') }
)
</script>

<style scoped>
.thumbnail-slot {
  width: 96px;
  height: 96px;
  flex: 0 0 96px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
}
.thumbnail-preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
