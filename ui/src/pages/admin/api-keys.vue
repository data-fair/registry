<template>
  <v-container data-iframe-height>
    <v-app-bar density="comfortable">
      <v-spacer />
      <personal-menu dark-mode-switch />
    </v-app-bar>

    <admin-nav />

    <!-- Create new key -->
    <v-card class="mb-4">
      <v-card-title>{{ t('createKey') }}</v-card-title>
      <v-card-text>
        <v-row>
          <v-col
            cols="12"
            sm="4"
          >
            <v-select
              v-model="newKey.type"
              :items="keyTypes"
              :label="t('type')"
              density="compact"
              hide-details
              variant="outlined"
            />
          </v-col>
          <v-col
            cols="12"
            sm="4"
          >
            <v-text-field
              v-model="newKey.name"
              :label="t('name')"
              density="compact"
              hide-details
              variant="outlined"
            />
          </v-col>
          <v-col
            cols="auto"
            class="d-flex align-center"
          >
            <v-btn
              color="primary"
              variant="flat"
              :disabled="!newKey.name || !newKey.type"
              :loading="createAction.loading.value"
              @click="createAction.execute()"
            >
              {{ t('create') }}
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Show newly created key -->
    <v-alert
      v-if="createdKey"
      type="success"
      class="mb-4"
      closable
      @click:close="createdKey = null"
    >
      <div class="font-weight-bold mb-1">
        {{ t('keyCreated') }}
      </div>
      <code class="d-block pa-2 bg-surface">{{ createdKey }}</code>
      <div class="text-body-2 mt-1">
        {{ t('keyWarning') }}
      </div>
    </v-alert>

    <!-- Key list -->
    <v-skeleton-loader
      v-if="keysFetch.loading.value && !keysFetch.data.value"
      type="table-tbody"
    />

    <v-card v-else-if="keysFetch.data.value">
      <v-card-title>
        {{ t('existingKeys') }}
        <span class="text-medium-emphasis text-body-2 ml-2">({{ keysFetch.data.value.count }})</span>
      </v-card-title>
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>{{ t('name') }}</th>
            <th>{{ t('type') }}</th>
            <th>{{ t('createdBy') }}</th>
            <th>{{ t('createdAt') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="key in keysFetch.data.value.results"
            :key="key._id"
          >
            <td>{{ key.name }}</td>
            <td>
              <v-chip
                size="small"
                :color="key.type === 'upload' ? 'blue' : 'green'"
              >
                {{ key.type }}
              </v-chip>
            </td>
            <td>{{ key.createdBy.name || key.createdBy.id }}</td>
            <td>{{ dayjs(key.createdAt).format('L LT') }}</td>
            <td class="text-right">
              <v-btn
                :icon="mdiDelete"
                color="error"
                size="small"
                variant="text"
                :loading="deletingKeyId === key._id"
                @click="deleteKey(key._id)"
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
  createKey: Créer une clé API
  type: Type
  name: Nom
  create: Créer
  keyCreated: "Clé créée avec succès. Copiez-la maintenant :"
  keyWarning: Cette clé ne sera plus affichée après fermeture.
  existingKeys: Clés existantes
  createdBy: Créé par
  createdAt: Créé le
  deleted: Clé supprimée
en:
  createKey: Create API Key
  type: Type
  name: Name
  create: Create
  keyCreated: "Key created successfully. Copy it now:"
  keyWarning: This key will not be shown again after you close this.
  existingKeys: Existing Keys
  createdBy: Created by
  createdAt: Created
  deleted: Key deleted
</i18n>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { mdiDelete } from '@mdi/js'
import personalMenu from '@data-fair/lib-vuetify/personal-menu.vue'

const { t } = useI18n()
const session = useSession()
const { dayjs } = useLocaleDayjs()

if (!session.state.user?.adminMode) {
  throw new Error('Admin mode required')
}

const keyTypes = [
  { title: 'Upload', value: 'upload' },
  { title: 'Federation', value: 'federation' }
]

const newKey = ref({ type: 'upload', name: '' })
const createdKey = ref<string | null>(null)
const deletingKeyId = ref<string | null>(null)

const keysFetch = useFetch<{ results: any[], count: number }>(
  `${$apiPath}/v1/api-keys`
)

const createAction = useAsyncAction(
  async () => {
    const res = await $fetch('/v1/api-keys', {
      method: 'POST',
      body: newKey.value
    })
    createdKey.value = res.key
    newKey.value = { type: 'upload', name: '' }
    keysFetch.refresh()
  }
)

async function deleteKey (id: string) {
  deletingKeyId.value = id
  try {
    await $fetch(`/v1/api-keys/${id}`, { method: 'DELETE' })
    keysFetch.refresh()
  } finally {
    deletingKeyId.value = null
  }
}
</script>
