<template>
  <div id="artefact-admin">
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
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { mdiRefresh } from '@mdi/js'
import { severityColor, SEVERITY_ORDER } from '~/utils/severity'
import type { Artefact } from '#api/types'

const { artefact } = defineProps<{ artefact: Artefact }>()
const emit = defineEmits<{ changed: [] }>()

const { t, locale } = useI18n()
const router = useRouter()

const confirmDelete = ref(false)

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
