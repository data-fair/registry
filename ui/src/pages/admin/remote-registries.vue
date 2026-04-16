<template>
  <v-container data-iframe-height>
    <admin-nav />

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
              density="compact"
              hide-details
              variant="outlined"
            />
          </v-col>
          <v-col
            cols="12"
            sm="5"
          >
            <v-text-field
              v-model="newRemote.url"
              :label="t('url')"
              density="compact"
              hide-details
              variant="outlined"
              placeholder="https://registry.example.com/registry/api"
            />
          </v-col>
          <v-col
            cols="12"
            sm="3"
          >
            <v-text-field
              v-model="newRemote.apiKey"
              :label="t('apiKey')"
              density="compact"
              hide-details
              variant="outlined"
              type="password"
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
      <v-card-title>
        {{ t('remoteRegistries') }}
        <span class="text-medium-emphasis text-body-2 ml-2">({{ registriesFetch.data.value.count }})</span>
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
            <td>
              <router-link :to="`/admin/remote-registries/${encodeURIComponent(reg._id)}`">
                {{ reg.name }}
              </router-link>
            </td>
            <td class="text-medium-emphasis">
              {{ reg._id }}
            </td>
            <td>
              <code>{{ reg.apiKeyShortId }}</code>
            </td>
            <td>{{ reg.selectedArtefacts.length }}</td>
            <td>
              <template v-if="reg.lastSyncAt">
                <v-chip
                  size="small"
                  :color="reg.lastSyncStatus === 'success' ? 'success' : 'error'"
                >
                  {{ reg.lastSyncStatus }}
                </v-chip>
                {{ dayjs(reg.lastSyncAt).format('L LT') }}
              </template>
              <span
                v-else
                class="text-medium-emphasis"
              >{{ t('neverSynced') }}</span>
            </td>
            <td class="text-right">
              <v-btn
                :icon="mdiDelete"
                color="error"
                size="small"
                variant="text"
                :loading="deletingId === reg._id"
                @click="deleteRemote(reg._id)"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  admin: Administration
  remoteRegistries: Registres distants
  addRemote: Ajouter un registre distant
  name: Nom
  url: URL
  apiKey: Clé API
  selections: Sélections
  lastSync: Dernière synchro
  neverSynced: Jamais synchronisé
  add: Ajouter
en:
  admin: Administration
  remoteRegistries: Remote Registries
  addRemote: Add Remote Registry
  name: Name
  url: URL
  apiKey: API Key
  selections: Selections
  lastSync: Last Sync
  neverSynced: Never synced
  add: Add
</i18n>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { mdiDelete } from '@mdi/js'
import { useBreadcrumbs } from '~/composables/breadcrumbs'

const { t } = useI18n()
const session = useSession()
const { dayjs } = useLocaleDayjs()

if (!session.state.user?.adminMode) {
  throw new Error('Admin mode required')
}

useBreadcrumbs().setForPage(() => [
  { title: t('admin'), disabled: true },
  { title: t('remoteRegistries'), disabled: true }
])

const newRemote = ref({ name: '', url: '', apiKey: '' })
const deletingId = ref<string | null>(null)

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
    registriesFetch.refresh()
  } finally {
    deletingId.value = null
  }
}
</script>
