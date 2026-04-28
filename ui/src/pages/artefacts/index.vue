<template>
  <v-container data-iframe-height>
    <v-tabs
      v-if="hasGrant"
      v-model="tab"
      class="mb-4"
    >
      <v-tab value="browse">
        {{ t('browse') }}
      </v-tab>
      <v-tab value="keys">
        {{ t('apiKeys') }}
      </v-tab>
    </v-tabs>

    <!-- Browse tab -->
    <template v-if="tab === 'browse'">
      <v-row class="mb-4">
        <v-col
          cols="12"
          sm="6"
          md="4"
        >
          <v-text-field
            v-model="q"
            :append-inner-icon="mdiMagnify"
            clearable
            color="primary"
            density="compact"
            hide-details
            :placeholder="t('search')"
            variant="outlined"
          />
        </v-col>
        <v-col
          cols="12"
          sm="4"
          md="3"
        >
          <v-select
            v-model="category"
            :items="categoryOptions"
            clearable
            density="compact"
            hide-details
            :label="t('category')"
            variant="outlined"
          />
        </v-col>
        <v-col cols="auto">
          <v-btn-toggle
            v-model="sort"
            color="primary"
            density="compact"
            mandatory
          >
            <v-btn value="dataUpdatedAt">
              {{ t('recent') }}
            </v-btn>
            <v-btn value="name">
              {{ t('name') }}
            </v-btn>
          </v-btn-toggle>
        </v-col>
      </v-row>

      <v-skeleton-loader
        v-if="artefactsFetch.loading.value && !artefactsFetch.data.value"
        type="table-tbody"
      />

      <template v-else-if="artefactsFetch.data.value">
        <v-table density="comfortable">
          <thead>
            <tr>
              <th>{{ t('name') }}</th>
              <th>{{ t('category') }}</th>
              <th>{{ t('version') }}</th>
              <th>{{ t('dataUpdatedAt') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="artefact in artefactsFetch.data.value.results"
              :key="artefact._id"
              style="cursor: pointer;"
              @click="router.push(`/artefacts/${encodeURIComponent(artefact._id)}`)"
            >
              <td>
                <strong>{{ (artefact.title as any)?.[locale] || artefact.name }}</strong>
                <br>
                <span class="text-medium-emphasis text-body-2">{{ artefact._id }}</span>
              </td>
              <td>
                <v-chip
                  size="small"
                  :color="categoryColor(artefact.category)"
                >
                  {{ categoryLabel(artefact.category, locale) }}
                </v-chip>
              </td>
              <td>{{ artefact.version || '-' }}</td>
              <td>{{ artefact.dataUpdatedAt ? dayjs(artefact.dataUpdatedAt).format('L LT') : '-' }}</td>
            </tr>
          </tbody>
        </v-table>

        <v-pagination
          v-if="nbPages > 1"
          v-model="page"
          :length="nbPages"
          class="mt-4"
        />

        <p class="text-medium-emphasis mt-2">
          {{ artefactsFetch.data.value.count }} {{ t('total') }}
        </p>
      </template>
    </template>

    <!-- API Keys tab -->
    <template v-if="tab === 'keys' && hasGrant">
      <!-- Create new read key -->
      <v-card class="mb-4">
        <v-card-title>{{ t('createKey') }}</v-card-title>
        <v-card-text>
          <v-row>
            <v-col
              cols="12"
              sm="6"
            >
              <v-text-field
                v-model="newKeyName"
                :label="t('keyName')"
                density="compact"
                hide-details
                variant="outlined"
              />
            </v-col>
            <v-col
              cols="12"
              sm="6"
            >
              <v-date-input
                v-model="newKeyExpiresAt"
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
                :disabled="!newKeyName"
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
              <th>{{ t('keyName') }}</th>
              <th>{{ t('createdAt') }}</th>
              <th>{{ t('expiresAt') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="key in keysFetch.data.value.results"
              :key="key._id"
              :class="{ 'text-error': key.expiresAt && dayjs(key.expiresAt).isBefore(dayjs()) }"
            >
              <td>{{ key.name }}</td>
              <td>{{ dayjs(key.createdAt).format('L LT') }}</td>
              <td>{{ key.expiresAt ? dayjs(key.expiresAt).format('L LT') : '—' }}</td>
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
    </template>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  artefacts: Artefacts
  browse: Parcourir
  apiKeys: "Cl\xE9s API"
  search: Rechercher
  category: "Cat\xE9gorie"
  recent: "R\xE9cents"
  name: Nom
  version: Version
  dataUpdatedAt: "Donn\xE9es mises \xE0 jour"
  total: artefact(s)
  createKey: "Cr\xE9er une cl\xE9 de lecture"
  keyName: "Nom de la cl\xE9"
  create: "Cr\xE9er"
  keyCreated: "Cl\xE9 cr\xE9\xE9e avec succ\xE8s. Copiez-la maintenant :"
  keyWarning: "Cette cl\xE9 ne sera plus affich\xE9e apr\xE8s fermeture."
  existingKeys: "Cl\xE9s existantes"
  createdAt: "Cr\xE9\xE9 le"
  expiresAt: Expiration
en:
  artefacts: Artefacts
  browse: Browse
  apiKeys: API Keys
  search: Search
  category: Category
  recent: Recent
  name: Name
  version: Version
  dataUpdatedAt: Data updated
  total: artefact(s)
  createKey: Create read key
  keyName: Key name
  create: Create
  keyCreated: "Key created successfully. Copy it now:"
  keyWarning: This key will not be shown again after you close this.
  existingKeys: Existing keys
  createdAt: Created
  expiresAt: Expires
</i18n>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { mdiMagnify, mdiDelete } from '@mdi/js'
import { VDateInput } from 'vuetify/labs/VDateInput'
import { useBreadcrumbs } from '~/composables/breadcrumbs'
import type { Artefact } from '#api/types'

const { t, locale } = useI18n()
const router = useRouter()
const session = useSession()
const { dayjs } = useLocaleDayjs()

useBreadcrumbs().setForPage(() => [{ title: t('artefacts'), disabled: true }])

// --- Grant check ---
const hasGrant = ref(false)
if (session.state.account) {
  $fetch('/v1/access-grants/me').then(() => { hasGrant.value = true }).catch(() => {})
}

const tab = ref('browse')

// --- Browse tab state ---
const q = useStringSearchParam('q')
const category = useStringSearchParam('category')
const sort = ref('dataUpdatedAt')
const pageSize = 20
const page = ref(1)

const categoryOptions = computed(() => categoryItems(locale.value))

const fetchParams = computed(() => ({
  size: pageSize,
  skip: (page.value - 1) * pageSize,
  sort: sort.value,
  ...(q.value ? { q: q.value } : {}),
  ...(category.value ? { category: category.value } : {})
}))

const artefactsFetch = useFetch<{ results: Artefact[], count: number }>(
  `${$apiPath}/v1/artefacts`,
  { query: fetchParams }
)

const nbPages = computed(() => {
  if (!artefactsFetch.data.value) return 0
  return Math.ceil(artefactsFetch.data.value.count / pageSize)
})

// --- API Keys tab state ---
const newKeyName = ref('')
const newKeyExpiresAt = ref<Date | null>(null)
const createdKey = ref<string | null>(null)
const deletingKeyId = ref<string | null>(null)

const keysFetch = useFetch<{ results: any[], count: number }>(
  () => hasGrant.value ? `${$apiPath}/v1/api-keys` : null
)

const createAction = useAsyncAction(
  async () => {
    const body: Record<string, unknown> = {
      type: 'read',
      name: newKeyName.value,
      owner: session.state.account
    }
    if (newKeyExpiresAt.value) {
      const d = new Date(newKeyExpiresAt.value)
      d.setHours(23, 59, 59)
      body.expiresAt = d.toISOString()
    }
    const res = await $fetch('/v1/api-keys', { method: 'POST', body })
    createdKey.value = res.key
    newKeyName.value = ''
    newKeyExpiresAt.value = null
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
