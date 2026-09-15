<template>
  <div class="pa-4">
    <!-- Add remote registry -->
    <v-card class="mb-4">
      <v-card-title>{{ t('addRemote') }}</v-card-title>
      <v-card-text>
        <v-row>
          <v-col
            cols="12"
            sm="3"
          >
            <v-text-field
              v-model="newRemote.name"
              :label="t('name')"
              variant="outlined"
              autocomplete="off"
            />
          </v-col>
          <v-col
            cols="12"
            sm="5"
          >
            <v-text-field
              v-model="newRemote.url"
              :label="t('url')"
              variant="outlined"
              placeholder="https://registry.example.com/registry"
            />
          </v-col>
          <v-col
            cols="12"
            sm="3"
          >
            <!-- Not type=password: Chrome would treat the form as a login form
                 and autofill name + key from its password manager. A masked text
                 field keeps the key hidden without triggering it. -->
            <v-text-field
              v-model="newRemote.apiKey"
              :label="t('apiKey')"
              variant="outlined"
              class="masked-input"
              autocomplete="off"
            />
          </v-col>
          <v-col
            cols="auto"
            class="d-flex align-center"
          >
            <v-btn
              color="primary"
              variant="flat"
              :disabled="!newRemote.name || !newRemote.url || !newRemote.apiKey"
              :loading="addAction.loading.value"
              @click="addAction.execute()"
            >
              {{ t('add') }}
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- List -->
    <v-skeleton-loader
      v-if="registriesFetch.loading.value && !registriesFetch.data.value"
      type="table-tbody"
    />

    <v-card v-else-if="registriesFetch.data.value">
      <v-card-title class="d-flex align-center ga-2">
        {{ t('remoteRegistries') }}
        <span class="text-medium-emphasis text-body-2">({{ registriesFetch.data.value.count }})</span>
      </v-card-title>
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>{{ t('name') }}</th>
            <th>{{ t('url') }}</th>
            <th>{{ t('apiKey') }}</th>
            <th>{{ t('selections') }}</th>
            <th>{{ t('lastSync') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="reg in registriesFetch.data.value.results"
            :key="reg._id"
          >
            <td class="font-weight-medium">
              {{ reg.name }}
            </td>
            <td class="text-medium-emphasis">
              {{ reg._id }}
            </td>
            <td>
              <code>{{ reg.apiKeyShortId }}</code>
            </td>
            <td>{{ reg.selectedArtefacts.length }}</td>
            <td>
              <div
                v-if="reg.syncState === 'running'"
                class="d-flex align-center ga-2"
              >
                <v-chip
                  size="small"
                  color="info"
                >
                  {{ t('running') }}
                </v-chip>
                <span
                  v-if="reg.syncProgress"
                  class="text-medium-emphasis text-body-2"
                >{{ reg.syncProgress.done }}/{{ reg.syncProgress.total }}</span>
              </div>
              <template v-else-if="reg.syncState === 'interrupted'">
                <v-chip
                  size="small"
                  color="warning"
                >
                  {{ t('interrupted') }}
                </v-chip>
              </template>
              <div
                v-else-if="reg.lastSyncAt"
                class="d-flex align-center ga-2"
              >
                <v-chip
                  size="small"
                  :color="reg.lastSyncStatus === 'success' ? 'success' : 'error'"
                >
                  {{ t(reg.lastSyncStatus === 'success' ? 'statusSuccess' : 'statusError') }}
                </v-chip>
                {{ dayjs(reg.lastSyncAt).format('L LT') }}
              </div>
              <span
                v-else
                class="text-medium-emphasis"
              >{{ t('neverSynced') }}</span>
            </td>
            <td class="text-right text-no-wrap">
              <v-btn
                color="primary"
                size="small"
                variant="tonal"
                :prepend-icon="mdiCog"
                :to="`/admin/remote-registries/${encodeURIComponent(reg._id)}`"
              >
                {{ t('manage') }}
              </v-btn>
              <v-btn
                :icon="mdiDelete"
                color="error"
                size="small"
                variant="text"
                class="ml-1"
                :title="t('delete')"
                @click="confirmDeleteId = reg._id"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <v-dialog
      :model-value="!!confirmDeleteId"
      max-width="400"
      @update:model-value="confirmDeleteId = null"
    >
      <v-card>
        <v-card-title>{{ t('confirmDeleteTitle') }}</v-card-title>
        <v-card-text>{{ t('confirmDeleteText', { name: confirmDeleteName }) }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="confirmDeleteId = null">
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="!!deletingId"
            @click="deleteRemote(confirmDeleteId!)"
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
  remoteRegistries: Registres distants
  addRemote: Ajouter un registre distant
  name: Nom
  url: URL
  apiKey: Clé API
  selections: Sélections
  lastSync: Dernière synchro
  neverSynced: Jamais synchronisé
  running: En cours
  interrupted: Interrompue
  statusSuccess: Succès
  statusError: Erreur
  add: Ajouter
  manage: Gérer
  delete: Supprimer
  cancel: Annuler
  confirmDeleteTitle: Confirmer la suppression
  confirmDeleteText: "Supprimer le registre distant \"{name}\" ? Ses artefacts miroir locaux seront déverrouillés mais pas supprimés."
en:
  remoteRegistries: Remote Registries
  addRemote: Add Remote Registry
  name: Name
  url: URL
  apiKey: API Key
  selections: Selections
  lastSync: Last Sync
  neverSynced: Never synced
  running: Running
  interrupted: Interrupted
  statusSuccess: Success
  statusError: Error
  add: Add
  manage: Manage
  delete: Delete
  cancel: Cancel
  confirmDeleteTitle: Confirm deletion
  confirmDeleteText: "Delete the remote registry \"{name}\"? Its local mirrored artefacts will be unlocked but not deleted."
</i18n>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { mdiDelete, mdiCog } from '@mdi/js'

const { t } = useI18n()
const { dayjs } = useLocaleDayjs()

const newRemote = ref({ name: '', url: '', apiKey: '' })
const deletingId = ref<string | null>(null)
const confirmDeleteId = ref<string | null>(null)
const confirmDeleteName = computed(() =>
  registriesFetch.data.value?.results.find(r => r._id === confirmDeleteId.value)?.name ?? confirmDeleteId.value ?? ''
)

const registriesFetch = useFetch<{ results: any[], count: number }>(
  `${$apiPath}/v1/remote-registries`
)

const addAction = useAsyncAction(
  async () => {
    await $fetch('/v1/remote-registries', {
      method: 'POST',
      body: { name: newRemote.value.name, url: newRemote.value.url, apiKey: newRemote.value.apiKey }
    })
    newRemote.value = { name: '', url: '', apiKey: '' }
    registriesFetch.refresh()
  }
)

async function deleteRemote (id: string) {
  deletingId.value = id
  try {
    await $fetch(`/v1/remote-registries/${encodeURIComponent(id)}`, { method: 'DELETE' })
    confirmDeleteId.value = null
    registriesFetch.refresh()
  } finally {
    deletingId.value = null
  }
}
</script>

<style scoped>
.masked-input :deep(input) {
  -webkit-text-security: disc;
}
</style>
