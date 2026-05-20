<template>
  <div class="pa-4">
    <!-- Create new upload key -->
    <v-card class="mb-4">
      <v-card-title>{{ t('createKey') }}</v-card-title>
      <v-card-text>
        <v-row>
          <v-col
            cols="12"
            sm="3"
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
            cols="12"
            sm="3"
          >
            <v-select
              v-model="newKey.allowedCategory"
              :items="categoryItems"
              :label="t('allowedCategory')"
              density="compact"
              hide-details
              variant="outlined"
              clearable
            />
          </v-col>
          <v-col
            cols="12"
            sm="3"
          >
            <v-text-field
              v-model="newKey.allowedName"
              :label="t('allowedName')"
              density="compact"
              hide-details
              variant="outlined"
              clearable
            />
          </v-col>
          <v-col
            cols="12"
            sm="3"
          >
            <v-text-field
              v-model="newKey.allowedPackageName"
              :label="t('allowedPackageName')"
              density="compact"
              hide-details
              variant="outlined"
              clearable
            />
          </v-col>
          <v-col
            cols="12"
            sm="3"
          >
            <v-date-input
              v-model="newKey.expiresAt"
              :label="t('expiresAt')"
              density="compact"
              hide-details
              variant="outlined"
              clearable
              prepend-icon=""
            />
          </v-col>
          <v-col
            cols="auto"
            class="d-flex align-center"
          >
            <v-btn
              color="primary"
              variant="flat"
              :disabled="!newKey.name"
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
            <th>{{ t('prefix') }}</th>
            <th>{{ t('name') }}</th>
            <th>{{ t('allowedCategory') }}</th>
            <th>{{ t('allowedName') }}</th>
            <th>{{ t('allowedPackageName') }}</th>
            <th>{{ t('createdBy') }}</th>
            <th>{{ t('createdAt') }}</th>
            <th>{{ t('expiresAt') }}</th>
            <th>{{ t('lastUsedAt') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="key in keysFetch.data.value.results"
            :key="key._id"
            :class="{ 'text-error': key.expiresAt && dayjs(key.expiresAt).isBefore(dayjs()) }"
          >
            <td><code>reg_{{ key.shortId }}</code></td>
            <td>{{ key.name }}</td>
            <td>{{ key.allowedCategory || '—' }}</td>
            <td>{{ key.allowedName || '—' }}</td>
            <td>{{ key.allowedPackageName || '—' }}</td>
            <td>{{ key.createdBy.name || key.createdBy.id }}</td>
            <td>{{ dayjs(key.createdAt).format('L LT') }}</td>
            <td>{{ key.expiresAt ? dayjs(key.expiresAt).format('L LT') : '—' }}</td>
            <td>{{ key.lastUsedAt ? dayjs(key.lastUsedAt).format('L LT') : t('never') }}</td>
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
  </div>
</template>

<i18n lang="yaml">
fr:
  createKey: Créer une clé d'upload
  name: Nom
  allowedCategory: Catégorie autorisée
  allowedName: Nom autorisé
  allowedPackageName: Paquet autorisé
  create: Créer
  keyCreated: "Clé créée avec succès. Copiez-la maintenant :"
  keyWarning: Cette clé ne sera plus affichée après fermeture.
  existingKeys: Clés existantes
  prefix: Préfixe
  createdBy: Créé par
  createdAt: Créé le
  expiresAt: Expiration
  lastUsedAt: Dernière utilisation
  never: Jamais
en:
  createKey: Create upload key
  name: Name
  allowedCategory: Allowed category
  allowedName: Allowed name
  allowedPackageName: Allowed package
  create: Create
  keyCreated: "Key created successfully. Copy it now:"
  keyWarning: This key will not be shown again after you close this.
  existingKeys: Existing Keys
  prefix: Prefix
  createdBy: Created by
  createdAt: Created
  expiresAt: Expires
  lastUsedAt: Last used
  never: Never
</i18n>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { mdiDelete } from '@mdi/js'
import { VDateInput } from 'vuetify/labs/VDateInput'

const { t } = useI18n()
const { dayjs } = useLocaleDayjs()

const categoryItems = [
  'processing',
  'catalog',
  'application',
  'other',
  'tileset',
  'maplibre-style'
]

type NewKey = {
  name: string
  allowedCategory: string | null
  allowedName: string | null
  allowedPackageName: string | null
  expiresAt: Date | null
}
const newKey = ref<NewKey>({ name: '', allowedCategory: null, allowedName: null, allowedPackageName: null, expiresAt: null })
const createdKey = ref<string | null>(null)
const deletingKeyId = ref<string | null>(null)

const keysFetch = useFetch<{ results: any[], count: number }>(
  `${$apiPath}/v1/api-keys?type=upload`
)

const createAction = useAsyncAction(
  async () => {
    const body: Record<string, unknown> = {
      type: 'upload',
      name: newKey.value.name
    }
    if (newKey.value.allowedCategory) body.allowedCategory = newKey.value.allowedCategory
    if (newKey.value.allowedName) body.allowedName = newKey.value.allowedName
    if (newKey.value.allowedPackageName) body.allowedPackageName = newKey.value.allowedPackageName
    if (newKey.value.expiresAt) {
      const d = new Date(newKey.value.expiresAt)
      d.setHours(23, 59, 59)
      body.expiresAt = d.toISOString()
    }
    const res = await $fetch('/v1/api-keys', { method: 'POST', body })
    createdKey.value = res.key
    newKey.value = { name: '', allowedCategory: null, allowedName: null, allowedPackageName: null, expiresAt: null }
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
