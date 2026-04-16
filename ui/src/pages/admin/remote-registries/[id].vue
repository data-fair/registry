<template>
  <v-container
    v-if="registry"
    data-iframe-height
  >
    <admin-nav />

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
              v-model="editName"
              :label="t('name')"
              density="compact"
              variant="outlined"
              hide-details
            />
          </v-col>
          <v-col
            cols="12"
            sm="6"
          >
            <div class="text-medium-emphasis text-body-2 mb-1">
              {{ t('apiKey') }}
            </div>
            <div class="mb-2">
              <code>{{ registry.apiKeyShortId }}</code>
            </div>
            <v-text-field
              v-model="newApiKey"
              :label="t('changeApiKey')"
              density="compact"
              variant="outlined"
              hide-details
              type="password"
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
          v-if="registry.lastSyncStatus"
          size="small"
          :color="registry.lastSyncStatus === 'success' ? 'success' : 'error'"
          class="ml-2"
        >
          {{ registry.lastSyncStatus }}
        </v-chip>
      </v-card-title>
      <v-card-text>
        <div v-if="registry.lastSyncAt">
          {{ t('lastSyncAt') }}: {{ dayjs(registry.lastSyncAt).format('L LT') }}
        </div>
        <div
          v-if="registry.lastSyncError"
          class="text-error mt-1"
        >
          {{ registry.lastSyncError }}
        </div>
        <div
          v-if="!registry.lastSyncAt"
          class="text-medium-emphasis"
        >
          {{ t('neverSynced') }}
        </div>
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="primary"
          variant="flat"
          :loading="syncAction.loading.value"
          @click="syncAction.execute()"
        >
          {{ t('syncNow') }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <!-- Remote artefacts -->
    <v-card class="mb-4">
      <v-card-title>
        {{ t('remoteArtefacts') }}
        <span
          v-if="remoteFetch.data.value"
          class="text-medium-emphasis text-body-2 ml-2"
        >({{ remoteFetch.data.value.count }})</span>
      </v-card-title>
      <v-card-text>
        <v-text-field
          v-model="searchQuery"
          :label="t('search')"
          density="compact"
          variant="outlined"
          hide-details
          class="mb-3"
          clearable
          @update:model-value="debouncedRefreshRemote"
        />
      </v-card-text>

      <v-skeleton-loader
        v-if="remoteFetch.loading.value && !remoteFetch.data.value"
        type="table-tbody"
      />

      <v-table
        v-else-if="remoteFetch.data.value"
        density="comfortable"
      >
        <thead>
          <tr>
            <th>{{ t('artefactName') }}</th>
            <th>{{ t('format') }}</th>
            <th>{{ t('category') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="art in remoteFetch.data.value.results"
            :key="art._id"
          >
            <td>{{ art.name }}</td>
            <td>
              <v-chip
                size="small"
                :color="art.format === 'npm' ? 'blue' : 'teal'"
              >
                {{ art.format }}
              </v-chip>
            </td>
            <td>
              <v-chip
                size="small"
                :color="categoryColor(art.category)"
              >
                {{ categoryLabel(art.category, locale) }}
              </v-chip>
            </td>
            <td class="text-right">
              <v-btn
                v-if="registry.selectedArtefacts.includes(art._id)"
                size="small"
                variant="text"
                color="error"
                :loading="unselectingId === art._id"
                @click="unselectArtefact(art._id)"
              >
                {{ t('unselect') }}
              </v-btn>
              <v-btn
                v-else
                size="small"
                variant="flat"
                color="primary"
                :loading="selectingId === art._id"
                @click="selectArtefact(art._id)"
              >
                {{ t('mirror') }}
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
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
  apiKey: Clé API
  changeApiKey: Nouvelle clé API
  save: Enregistrer
  saved: Modifications enregistrées
  syncStatus: Synchronisation
  lastSyncAt: Dernière synchro
  neverSynced: Jamais synchronisé
  syncNow: Synchroniser maintenant
  syncStarted: Synchronisation lancée
  remoteArtefacts: Artefacts distants
  search: Rechercher
  artefactName: Nom
  format: Format
  category: Catégorie
  mirror: Sélectionner
  unselect: Désélectionner
  dangerZone: Zone de danger
  deleteRemote: Supprimer ce registre distant
  confirmDeleteTitle: Confirmer la suppression
  confirmDeleteText: Cela déverrouillera les artefacts miroir locaux mais ne les supprimera pas.
  cancel: Annuler
  delete: Supprimer
en:
  admin: Administration
  remoteRegistries: Remote Registries
  config: Configuration
  name: Name
  apiKey: API Key
  changeApiKey: New API Key
  save: Save
  saved: Changes saved
  syncStatus: Synchronization
  lastSyncAt: Last sync
  neverSynced: Never synced
  syncNow: Sync Now
  syncStarted: Sync started
  remoteArtefacts: Remote Artefacts
  search: Search
  artefactName: Name
  format: Format
  category: Category
  mirror: Select
  unselect: Unselect
  dangerZone: Danger Zone
  deleteRemote: Delete this remote registry
  confirmDeleteTitle: Confirm Deletion
  confirmDeleteText: This will unlock local mirrored artefacts but will not delete them.
  cancel: Cancel
  delete: Delete
</i18n>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { useBreadcrumbs } from '~/composables/breadcrumbs'
import { categoryColor, categoryLabel } from '~/utils/categories'

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
const selectingId = ref<string | null>(null)
const unselectingId = ref<string | null>(null)

useBreadcrumbs().setForPage(() => [
  { title: t('admin'), disabled: true },
  { title: t('remoteRegistries'), to: '/admin/remote-registries' },
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

const remoteFetch = useFetch<{ results: any[], count: number }>(
  computed(() => {
    const params = new URLSearchParams({ size: '100' })
    if (searchQuery.value) params.set('q', searchQuery.value)
    return `${$apiPath}/v1/remote-registries/${encodeURIComponent(registryId.value)}/remote-artefacts?${params}`
  })
)

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
    await $fetch(`/v1/remote-registries/${encodeURIComponent(registryId.value)}/sync`, {
      method: 'POST'
    })
    setTimeout(fetchRegistry, 2000)
  },
  { success: t('syncStarted') }
)

async function selectArtefact (artefactId: string) {
  selectingId.value = artefactId
  try {
    await $fetch(`/v1/remote-registries/${encodeURIComponent(registryId.value)}/selected-artefacts`, {
      method: 'POST',
      body: { artefactId }
    })
    await fetchRegistry()
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
    await fetchRegistry()
  } finally {
    unselectingId.value = null
  }
}

const deleteAction = useAsyncAction(
  async () => {
    await $fetch(`/v1/remote-registries/${encodeURIComponent(registryId.value)}`, {
      method: 'DELETE'
    })
    router.push('/admin/remote-registries')
  }
)
</script>
