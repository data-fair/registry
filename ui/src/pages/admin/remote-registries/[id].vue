<template>
  <v-container
    v-if="registry"
    data-iframe-height
  >
    <!-- Config -->
    <v-card class="mb-4">
      <v-card-title>{{ t('config') }}</v-card-title>
      <v-card-text>
        <v-row>
          <v-col
            cols="12"
            sm="6"
          >
            <v-text-field
              :model-value="registry._id"
              :label="t('url')"
              variant="outlined"
              readonly
            />
          </v-col>
          <v-col
            cols="12"
            sm="6"
          >
            <v-text-field
              v-model="editName"
              :label="t('name')"
              variant="outlined"
              autocomplete="off"
            />
          </v-col>
          <v-col
            cols="12"
            sm="6"
          >
            <v-text-field
              :model-value="registry.apiKeyShortId"
              :label="t('apiKey')"
              variant="outlined"
              readonly
            />
          </v-col>
          <v-col
            cols="12"
            sm="6"
          >
            <!-- Masked text rather than type=password: see remote-registries-section. -->
            <v-text-field
              v-model="newApiKey"
              :label="t('changeApiKey')"
              variant="outlined"
              class="masked-input"
              autocomplete="off"
            />
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!editName && !newApiKey"
          :loading="patchAction.loading.value"
          @click="patchAction.execute()"
        >
          {{ t('save') }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <!-- Sync status -->
    <v-card class="mb-4">
      <v-card-title>
        {{ t('syncStatus') }}
        <v-chip
          v-if="syncRunning"
          size="small"
          color="info"
          class="ml-2"
        >
          {{ t('running') }}
        </v-chip>
        <v-chip
          v-else-if="syncInterrupted"
          size="small"
          color="warning"
          class="ml-2"
        >
          {{ t('interrupted') }}
        </v-chip>
        <v-chip
          v-else-if="registry.lastSyncStatus"
          size="small"
          :color="registry.lastSyncStatus === 'success' ? 'success' : 'error'"
          class="ml-2"
        >
          {{ t(registry.lastSyncStatus === 'success' ? 'statusSuccess' : 'statusError') }}
        </v-chip>
      </v-card-title>
      <v-card-text>
        <template v-if="syncRunning && registry.syncProgress">
          <v-progress-linear
            :model-value="syncPercent"
            :indeterminate="!registry.syncProgress.total"
            height="6"
            rounded
            color="info"
            class="mb-2"
          />
          <div class="text-body-2">
            {{ registry.syncProgress.done }} / {{ registry.syncProgress.total }}
            <template v-if="registry.syncProgress.currentArtefact">
              — <code>{{ registry.syncProgress.currentArtefact }}</code>
            </template>
          </div>
          <div class="text-medium-emphasis text-body-2">
            {{ t('startedAt') }}: {{ dayjs(registry.syncProgress.startedAt).format('LT') }}
          </div>
        </template>

        <template v-else-if="syncRunning">
          <v-progress-linear
            indeterminate
            height="6"
            rounded
            color="info"
            class="mb-2"
          />
          <div class="text-body-2 text-medium-emphasis">
            {{ t('syncStarting') }}
          </div>
        </template>

        <template v-else-if="syncInterrupted && registry.syncProgress">
          <div>
            {{ t('stoppedAt', { done: registry.syncProgress.done, total: registry.syncProgress.total }) }}
          </div>
          <div class="text-medium-emphasis text-body-2">
            {{ t('startedAt') }}: {{ dayjs(registry.syncProgress.startedAt).format('L LT') }}
          </div>
        </template>

        <div v-if="!syncRunning && registry.lastSyncAt">
          {{ t('lastSyncAt') }}: {{ dayjs(registry.lastSyncAt).format('L LT') }}
        </div>
        <div
          v-if="!syncRunning && registry.lastSyncError"
          class="text-error mt-1"
        >
          {{ registry.lastSyncError }}
        </div>
        <div
          v-if="!syncRunning && !syncInterrupted && !registry.lastSyncAt"
          class="text-medium-emphasis"
        >
          {{ t('neverSynced') }}
        </div>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-btn
          color="primary"
          variant="flat"
          :disabled="syncRunning"
          :loading="syncAction.loading.value"
          @click="syncAction.execute()"
        >
          {{ t('syncNow') }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <!-- Remote artefacts -->
    <v-card class="mb-4">
      <v-card-title class="d-flex align-center ga-2">
        {{ t('remoteArtefacts') }}
        <span
          v-if="remoteFetch.data.value"
          class="text-medium-emphasis text-body-2"
        >({{ remoteFetch.data.value.count }})</span>
      </v-card-title>
      <v-card-text>
        <v-row dense>
          <v-col
            cols="12"
            sm="6"
            md="5"
          >
            <v-text-field
              v-model="searchQuery"
              :append-inner-icon="mdiMagnify"
              :placeholder="t('search')"
              variant="outlined"
              clearable
              @update:model-value="debouncedRefreshRemote"
            />
          </v-col>
          <v-col
            cols="12"
            sm="3"
            md="3"
          >
            <v-select
              :model-value="remoteCategory || null"
              :items="categoryOptions"
              :label="t('category')"
              variant="outlined"
              clearable
              @update:model-value="remoteCategory = $event ?? ''"
            />
          </v-col>
          <v-col
            cols="12"
            sm="3"
            md="2"
          >
            <v-select
              :model-value="remoteFormat || null"
              :items="formatOptions"
              :label="t('format')"
              variant="outlined"
              clearable
              @update:model-value="remoteFormat = $event ?? ''"
            />
          </v-col>
        </v-row>
      </v-card-text>

      <v-skeleton-loader
        v-if="remoteFetch.loading.value && !remoteFetch.data.value"
        type="table-tbody"
      />

      <template v-else-if="remoteFetch.data.value">
        <v-table
          density="comfortable"
          hover
        >
          <thead>
            <tr>
              <th style="width: 56px;" />
              <th>{{ t('artefactName') }}</th>
              <th>{{ t('category') }}</th>
              <th>{{ t('version') }}</th>
              <th>{{ t('size') }}</th>
              <th>{{ t('dataUpdatedAt') }}</th>
              <th>{{ t('mirrorStatus') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="art in remoteFetch.data.value.results"
              :key="art._id"
            >
              <td>
                <img
                  v-if="art.thumbnail"
                  :src="`${$apiPath}/v1/remote-registries/${encodeURIComponent(registryId)}/remote-thumbnails/${art.thumbnail.id}/data`"
                  :alt="art.title?.[locale] || art.name"
                  width="40"
                  height="40"
                  style="object-fit: contain; display: block;"
                >
              </td>
              <td>
                <strong>{{ art.title?.[locale] || art.name }}</strong>
                <v-chip
                  v-if="art.deprecated"
                  size="x-small"
                  color="warning"
                  class="ml-2"
                >
                  {{ t('deprecated') }}
                </v-chip>
                <br>
                <span class="text-medium-emphasis text-body-2">{{ art._id }}</span>
              </td>
              <td>
                <v-chip
                  size="small"
                  :color="categoryColor(art.category)"
                >
                  {{ categoryLabel(art.category, locale) }}
                </v-chip>
              </td>
              <td>{{ art.version || '-' }}</td>
              <td>{{ typeof art.size === 'number' ? formatBytes(art.size, locale) : '-' }}</td>
              <td>{{ art.dataUpdatedAt ? dayjs(art.dataUpdatedAt).format('L LT') : '-' }}</td>
              <td>
                <template v-if="isSelected(art._id)">
                  <v-progress-circular
                    v-if="syncingId === art._id"
                    indeterminate
                    size="16"
                    width="2"
                    class="mr-1"
                  />
                  <v-chip
                    v-if="syncingId === art._id"
                    size="small"
                    color="info"
                  >
                    {{ t('syncing') }}
                  </v-chip>
                  <v-chip
                    v-else-if="!art.local?.synced"
                    size="small"
                    color="warning"
                  >
                    {{ t('pendingSync') }}
                  </v-chip>
                  <v-chip
                    v-else-if="!art.local.upToDate"
                    size="small"
                    color="warning"
                  >
                    {{ t('updateAvailable') }}
                  </v-chip>
                  <v-chip
                    v-else
                    size="small"
                    color="success"
                  >
                    {{ t('synced') }}
                  </v-chip>
                </template>
                <v-chip
                  v-else-if="art.local?.conflict"
                  size="small"
                  color="error"
                  :title="t('conflictHint')"
                >
                  {{ t('conflict') }}
                </v-chip>
                <span
                  v-else
                  class="text-medium-emphasis"
                >—</span>
              </td>
              <td class="text-right text-no-wrap">
                <v-btn
                  v-if="isSelected(art._id)"
                  size="small"
                  variant="text"
                  color="error"
                  :loading="unselectingId === art._id"
                  @click="confirmUnselectId = art._id"
                >
                  {{ t('unselect') }}
                </v-btn>
                <v-btn
                  v-else
                  size="small"
                  variant="flat"
                  color="primary"
                  :disabled="!!art.local?.conflict"
                  :loading="selectingId === art._id"
                  @click="selectArtefact(art._id)"
                >
                  {{ t('mirror') }}
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>

        <v-pagination
          v-if="nbRemotePages > 1"
          v-model="remotePage"
          :length="nbRemotePages"
          class="my-4"
        />
      </template>
    </v-card>

    <!-- Delete -->
    <v-card
      color="error"
      variant="outlined"
    >
      <v-card-title>{{ t('dangerZone') }}</v-card-title>
      <v-card-text>
        <v-btn
          color="error"
          variant="flat"
          @click="confirmDelete = true"
        >
          {{ t('deleteRemote') }}
        </v-btn>
      </v-card-text>
    </v-card>

    <!-- Unselecting keeps the local copy but unlocks it: it becomes a plain
         local artefact, and its id can no longer be mirrored until it is
         deleted. Worth a word before the click. -->
    <v-dialog
      :model-value="!!confirmUnselectId"
      max-width="480"
      @update:model-value="confirmUnselectId = null"
    >
      <v-card>
        <v-card-title>{{ t('confirmUnselectTitle') }}</v-card-title>
        <v-card-text>{{ t('confirmUnselectText', { id: confirmUnselectId }) }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="confirmUnselectId = null">
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="!!unselectingId"
            @click="unselectArtefact(confirmUnselectId!)"
          >
            {{ t('unselect') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      v-model="confirmDelete"
      max-width="400"
    >
      <v-card>
        <v-card-title>{{ t('confirmDeleteTitle') }}</v-card-title>
        <v-card-text>{{ t('confirmDeleteText') }}</v-card-text>
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
  remoteRegistries: Registres distants
  config: Configuration
  name: Nom
  url: URL
  apiKey: Clé API
  changeApiKey: Nouvelle clé API
  save: Enregistrer
  saved: Modifications enregistrées
  syncStatus: Synchronisation
  lastSyncAt: Dernière synchro
  neverSynced: Jamais synchronisé
  syncNow: Synchroniser maintenant
  syncStarted: Synchronisation lancée
  syncStarting: Démarrage…
  running: En cours
  interrupted: Interrompue
  startedAt: Démarrée à
  stoppedAt: Arrêtée à {done}/{total} artefacts
  syncAlreadyRunning: Une synchronisation est déjà en cours
  remoteArtefacts: Artefacts distants
  search: Rechercher
  artefactName: Nom
  format: Format
  category: Catégorie
  mirror: Sélectionner
  unselect: Désélectionner
  version: Version
  size: Taille
  dataUpdatedAt: Données mises à jour
  deprecated: Déprécié
  mirrorStatus: Synchronisation
  statusSuccess: Succès
  statusError: Erreur
  syncing: Synchronisation…
  pendingSync: En attente de synchro
  updateAvailable: Mise à jour disponible
  synced: Synchronisé
  conflict: Artefact local existant
  selectionFailed: Échec de la sélection
  conflictHint: Un artefact téléversé localement porte déjà cet identifiant ; supprimez-le pour pouvoir mirrorer celui du registre distant.
  syncDone: "Synchronisation terminée ({n} artefact) | Synchronisation terminée ({n} artefacts)"
  syncFailed: "Échec de la synchronisation : {error}"
  dangerZone: Zone de danger
  deleteRemote: Supprimer ce registre distant
  confirmUnselectTitle: Arrêter le miroir ?
  confirmUnselectText: "La copie locale de \"{id}\" est conservée mais devient un artefact local ordinaire, plus synchronisé. Tant qu'elle existe, cet identifiant ne pourra pas être mirroré à nouveau."
  confirmDeleteTitle: Confirmer la suppression
  confirmDeleteText: Cela déverrouillera les artefacts miroir locaux mais ne les supprimera pas.
  cancel: Annuler
  delete: Supprimer
en:
  admin: Administration
  remoteRegistries: Remote registries
  config: Configuration
  name: Name
  url: URL
  apiKey: API Key
  changeApiKey: New API Key
  save: Save
  saved: Changes saved
  syncStatus: Synchronization
  lastSyncAt: Last sync
  neverSynced: Never synced
  syncNow: Sync Now
  syncStarted: Sync started
  syncStarting: Starting…
  running: Running
  interrupted: Interrupted
  startedAt: Started at
  stoppedAt: Stopped at {done}/{total} artefacts
  syncAlreadyRunning: A sync is already running
  remoteArtefacts: Remote Artefacts
  search: Search
  artefactName: Name
  format: Format
  category: Category
  mirror: Select
  unselect: Unselect
  version: Version
  size: Size
  dataUpdatedAt: Data updated
  deprecated: Deprecated
  mirrorStatus: Synchronization
  statusSuccess: Success
  statusError: Error
  syncing: Syncing…
  pendingSync: Pending sync
  updateAvailable: Update available
  synced: Synced
  conflict: Local artefact exists
  selectionFailed: Selection failed
  conflictHint: A locally uploaded artefact already has this id; delete it to mirror the remote one.
  syncDone: "Sync done ({n} artefact) | Sync done ({n} artefacts)"
  syncFailed: "Sync failed: {error}"
  dangerZone: Danger Zone
  deleteRemote: Delete this remote registry
  confirmUnselectTitle: Stop mirroring?
  confirmUnselectText: "The local copy of \"{id}\" is kept but becomes a plain local artefact, no longer synced. While it exists, this id cannot be mirrored again."
  confirmDeleteTitle: Confirm Deletion
  confirmDeleteText: This will unlock local mirrored artefacts but will not delete them.
  cancel: Cancel
  delete: Delete
</i18n>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { mdiMagnify } from '@mdi/js'
import { useBreadcrumbs } from '~/composables/breadcrumbs'
import { useRegistrySync } from '~/composables/registry-sync'
import { categoryColor, categoryLabel, categoryItems } from '~/utils/categories'

const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute()
const session = useSession()
const { dayjs } = useLocaleDayjs()

if (!session.state.user?.adminMode) {
  throw new Error('Admin mode required')
}

const registryId = computed(() => decodeURIComponent((route.params as { id: string }).id))

const registry = ref<any>(null)
const fetchLoading = ref(true)
const editName = ref('')
const newApiKey = ref('')
const confirmDelete = ref(false)
const searchQuery = ref('')
const remoteCategory = ref('')
const remoteFormat = ref('')
const remotePageSize = 20
const remotePage = ref(1)
const selectingId = ref<string | null>(null)
const unselectingId = ref<string | null>(null)
const confirmUnselectId = ref<string | null>(null)

const { sendUiNotif } = useUiNotif()

useRegistrySync(registryId.value, registry, {
  // A sync just ended (a selection's own, or a full one): the per-row mirror
  // state comes from the server, so refetch it and tell the admin how it went.
  onDone: (event) => {
    remoteFetch.refresh()
    if (event.lastSyncStatus === 'error') {
      sendUiNotif({ type: 'error', msg: t('syncFailed', { error: event.lastSyncError ?? '' }) })
    } else {
      sendUiNotif({ type: 'success', msg: t('syncDone', event.total) })
    }
  }
})

const syncRunning = computed(() => registry.value?.syncState === 'running')
// The row currently being mirrored, straight from the ws progress frames.
const syncingId = computed(() => syncRunning.value ? registry.value?.syncProgress?.currentArtefact ?? null : null)
const isSelected = (artefactId: string) => registry.value?.selectedArtefacts.includes(artefactId)
const syncInterrupted = computed(() => registry.value?.syncState === 'interrupted')
const syncPercent = computed(() => {
  const progress = registry.value?.syncProgress
  if (!progress?.total) return 0
  return Math.round((progress.done / progress.total) * 100)
})

useBreadcrumbs().setForPage(() => [
  { title: t('admin'), to: '/admin' },
  { title: t('remoteRegistries'), to: '/admin#remote-registries' },
  { title: registry.value?.name || registryId.value, disabled: true }
])

async function fetchRegistry () {
  fetchLoading.value = true
  try {
    registry.value = await $fetch(`/v1/remote-registries/${encodeURIComponent(registryId.value)}`)
    editName.value = registry.value.name
  } finally {
    fetchLoading.value = false
  }
}

onMounted(fetchRegistry)

const categoryOptions = computed(() => categoryItems(locale.value))
const formatOptions = [{ title: 'npm', value: 'npm' }, { title: 'file', value: 'file' }]

const remoteFetch = useFetch<{ results: any[], count: number }>(
  computed(() => {
    const params = new URLSearchParams({
      size: String(remotePageSize),
      skip: String((remotePage.value - 1) * remotePageSize)
    })
    if (searchQuery.value) params.set('q', searchQuery.value)
    if (remoteCategory.value) params.set('category', remoteCategory.value)
    if (remoteFormat.value) params.set('format', remoteFormat.value)
    return `${$apiPath}/v1/remote-registries/${encodeURIComponent(registryId.value)}/remote-artefacts?${params}`
  })
)

// `count` is the upstream's, before deprecated-and-unselected rows are dropped
// locally, so a page can be a little short — acceptable for an admin table.
const nbRemotePages = computed(() => {
  if (!remoteFetch.data.value) return 0
  return Math.ceil(remoteFetch.data.value.count / remotePageSize)
})
watch([searchQuery, remoteCategory, remoteFormat], () => { remotePage.value = 1 })

let debounceTimer: ReturnType<typeof setTimeout> | undefined
function debouncedRefreshRemote () {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => remoteFetch.refresh(), 300)
}

const patchAction = useAsyncAction(
  async () => {
    const body: Record<string, string> = {}
    if (editName.value && editName.value !== registry.value?.name) body.name = editName.value
    if (newApiKey.value) body.apiKey = newApiKey.value
    await $fetch(`/v1/remote-registries/${encodeURIComponent(registryId.value)}`, {
      method: 'PATCH',
      body
    })
    newApiKey.value = ''
    await fetchRegistry()
  },
  { success: t('saved') }
)

const syncAction = useAsyncAction(
  async () => {
    try {
      await $fetch(`/v1/remote-registries/${encodeURIComponent(registryId.value)}/sync`, {
        method: 'POST'
      })
      // Optimistic: the first ws progress event fills syncProgress in within milliseconds.
      // Clearing it avoids showing the *previous* run's completed bar in the meantime.
      if (registry.value) {
        registry.value.syncState = 'running'
        registry.value.syncProgress = undefined
      }
      sendUiNotif({ type: 'success', msg: t('syncStarted') })
    } catch (err: any) {
      // losing the race with a peer replica or another admin is not a fault
      if ((err.status ?? err.statusCode) === 409) {
        sendUiNotif({ type: 'warning', msg: t('syncAlreadyRunning') })
        await fetchRegistry()
        return
      }
      throw err
    }
  }
)

// A failed selection (409 on a conflicting local artefact, network error…)
// must be visible: a silently swallowed error looks like a dead button.
const notifyError = (error: unknown) => sendUiNotif({ msg: t('selectionFailed'), error })

async function selectArtefact (artefactId: string) {
  selectingId.value = artefactId
  try {
    await $fetch(`/v1/remote-registries/${encodeURIComponent(registryId.value)}/selected-artefacts`, {
      method: 'POST',
      body: { artefactId }
    })
    // The server starts (or queues) a sync of this artefact; ws frames take
    // over from here and refresh the table once it lands.
    await fetchRegistry()
  } catch (err) {
    notifyError(err)
  } finally {
    selectingId.value = null
  }
}

async function unselectArtefact (artefactId: string) {
  unselectingId.value = artefactId
  try {
    await $fetch(`/v1/remote-registries/${encodeURIComponent(registryId.value)}/selected-artefacts/${encodeURIComponent(artefactId)}`, {
      method: 'DELETE'
    })
    confirmUnselectId.value = null
    await fetchRegistry()
    remoteFetch.refresh()
  } catch (err) {
    notifyError(err)
  } finally {
    unselectingId.value = null
  }
}

const deleteAction = useAsyncAction(
  async () => {
    await $fetch(`/v1/remote-registries/${encodeURIComponent(registryId.value)}`, {
      method: 'DELETE'
    })
    router.push('/admin')
  }
)
</script>

<style scoped>
.masked-input :deep(input) {
  -webkit-text-security: disc;
}
</style>
