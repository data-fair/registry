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

    <!-- Vulnerability scan (npm only; scan data is admin-only and stripped server-side for others) -->
    <v-card
      v-if="artefact.format === 'npm'"
      class="mb-4"
    >
      <v-card-title class="d-flex align-center">
        {{ t('scanTitle') }}
        <v-spacer />
        <v-btn
          size="small"
          variant="text"
          :prepend-icon="mdiRefresh"
          :loading="rescanAction.loading.value"
          @click="rescanAction.execute()"
        >
          {{ t('rescan') }}
        </v-btn>
      </v-card-title>
      <v-card-text>
        <div v-if="!artefact.scan">
          {{ t('scanNever') }}
        </div>
        <template v-else>
          <div class="mb-2 d-flex align-center ga-1 flex-wrap">
            <template
              v-for="sev in severities"
              :key="sev"
            >
              <v-chip
                v-if="(artefact.scan.summary?.[sev] ?? 0) > 0"
                :color="sevColor(sev)"
                size="small"
                label
              >
                {{ artefact.scan.summary?.[sev] }} {{ t(sev) }}
              </v-chip>
            </template>
            <span v-if="(artefact.scan.summary?.total ?? 0) === 0 && artefact.scan.status === 'success'">{{ t('scanClean') }}</span>
          </div>
          <v-alert
            v-if="artefact.scan.hasInstallScripts"
            type="warning"
            density="compact"
            variant="tonal"
            class="mb-2"
          >
            {{ t('hasInstallScripts') }}
          </v-alert>
          <v-alert
            v-if="artefact.scan.status === 'error'"
            type="error"
            density="compact"
            variant="tonal"
            class="mb-2"
          >
            {{ artefact.scan.error || t('scanFailed') }}
          </v-alert>
          <div class="text-caption mb-2">
            {{ t('scanStatus') }}: {{ artefact.scan.status }}<template v-if="artefact.scan.finishedAt">
              — {{ new Date(artefact.scan.finishedAt).toLocaleString(locale) }}
            </template>
          </div>
          <v-table
            v-if="findings.length"
            density="compact"
          >
            <thead>
              <tr>
                <th>{{ t('package') }}</th>
                <th>{{ t('installed') }}</th>
                <th>{{ t('fixedIn') }}</th>
                <th>{{ t('severity') }}</th>
                <th>{{ t('advisory') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="f in sortedFindings"
                :key="f.id + f.pkgName"
              >
                <td>{{ f.pkgName }}</td>
                <td>{{ f.installedVersion }}</td>
                <td>{{ f.fixedVersion || '—' }}</td>
                <td>
                  <v-chip
                    :color="sevColor(f.severity)"
                    size="x-small"
                    label
                  >
                    {{ t(f.severity) }}
                  </v-chip>
                </td>
                <td>
                  <a
                    v-if="f.primaryUrl"
                    :href="f.primaryUrl"
                    target="_blank"
                    rel="noopener"
                  >{{ f.id }}</a>
                  <span v-else>{{ f.id }}</span>
                </td>
              </tr>
            </tbody>
          </v-table>
        </template>
      </v-card-text>
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
  scanTitle: Analyse de vulnérabilités
  rescan: Réanalyser
  rescanQueued: Analyse demandée
  scanNever: Pas encore analysé
  scanClean: Aucune vulnérabilité connue
  scanStatus: Statut
  scanFailed: Échec de l'analyse
  hasInstallScripts: Ce paquet exécute des scripts d'installation (preinstall/postinstall) — à vérifier avant utilisation.
  critical: critique
  high: élevée
  medium: moyenne
  low: faible
  unknown: inconnue
  package: Paquet
  installed: Installée
  fixedIn: Corrigé dans
  severity: Gravité
  advisory: Avis
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
  scanTitle: Vulnerability scan
  rescan: Rescan
  rescanQueued: Scan queued
  scanNever: Not scanned yet
  scanClean: No known vulnerabilities
  scanStatus: Status
  scanFailed: Scan failed
  hasInstallScripts: This package runs install scripts (preinstall/postinstall) — review before use.
  critical: critical
  high: high
  medium: medium
  low: low
  unknown: unknown
  package: Package
  installed: Installed
  fixedIn: Fixed in
  severity: Severity
  advisory: Advisory
</i18n>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { mdiImage, mdiRefresh } from '@mdi/js'
import equal from 'fast-deep-equal'
import { computedDeepDiff } from '@data-fair/lib-vue/deep-diff.js'
import { useLeaveGuard } from '@data-fair/lib-vue/leave-guard.js'
import type { VjsfOptions } from '@koumoul/vjsf/types.js'
import { severityColor, SEVERITY_ORDER } from '~/utils/severity'
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

type ScanFinding = {
  id: string
  pkgName: string
  installedVersion: string
  fixedVersion?: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown'
  title?: string
  primaryUrl?: string
}

const severities = SEVERITY_ORDER
// Shared with the list column and dashboard section (single source of truth).
const sevColor = severityColor

const findings = ref<ScanFinding[]>([])

// The API returns findings grouped by package in scanner order, which buries
// criticals among lower-severity rows. Surface the most severe first; tie-break
// by package then advisory id for a stable, scannable order.
const sortedFindings = computed(() =>
  [...findings.value].sort((a, b) =>
    SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
    a.pkgName.localeCompare(b.pkgName) ||
    a.id.localeCompare(b.id)
  )
)
const loadFindings = async () => {
  if (artefact.format !== 'npm' || !artefact.scan) { findings.value = []; return }
  try {
    const res = await $fetch(`/v1/artefacts/${encodeURIComponent(artefact._id)}/scan`)
    findings.value = res.vulnerabilities ?? []
  } catch { findings.value = [] }
}
onMounted(loadFindings)

const rescanAction = useAsyncAction(
  async () => {
    await $fetch(`/v1/artefacts/${encodeURIComponent(artefact._id)}/scan`, { method: 'POST' })
    emit('changed')
  },
  { success: t('rescanQueued') }
)
</script>
