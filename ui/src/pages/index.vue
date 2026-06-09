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
        <v-col cols="auto">
          <v-checkbox
            v-model="showDeprecated"
            color="primary"
            density="compact"
            hide-details
            :label="t('showDeprecated')"
          />
        </v-col>
      </v-row>

      <v-skeleton-loader
        v-if="artefactsFetch.loading.value && !artefactsFetch.data.value"
        type="table-tbody"
      />

      <template v-else-if="artefactsFetch.data.value">
        <v-table
          density="comfortable"
          hover
        >
          <thead>
            <tr>
              <th style="width: 56px;" />
              <th>{{ t('name') }}</th>
              <th>{{ t('category') }}</th>
              <th>{{ t('group') }}</th>
              <th>{{ t('version') }}</th>
              <th>{{ t('size') }}</th>
              <th v-if="adminMode">
                {{ t('visibility') }}
              </th>
              <th>{{ t('dataUpdatedAt') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="artefact in artefactsFetch.data.value.results"
              :key="artefact._id"
              class="artefact-row"
            >
              <td>
                <img
                  v-if="artefact.thumbnail"
                  :src="`${$apiPath}/v1/thumbnails/${artefact.thumbnail.id}/data`"
                  :alt="(artefact.title as any)?.[locale] || artefact.name"
                  width="40"
                  height="40"
                  style="object-fit: contain; display: block;"
                >
              </td>
              <td>
                <router-link
                  :to="`/artefacts/${encodeURIComponent(artefact._id)}`"
                  class="artefact-row-link"
                >
                  <strong>{{ (artefact.title as any)?.[locale] || artefact.name }}</strong>
                </router-link>
                <v-chip
                  v-if="adminMode && artefact.origin"
                  size="x-small"
                  color="info"
                  class="ml-2"
                >
                  {{ t('mirror') }}
                </v-chip>
                <v-chip
                  v-if="artefact.deprecated"
                  size="x-small"
                  color="warning"
                  class="ml-2"
                >
                  {{ t('deprecated') }}
                </v-chip>
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
              <td>{{ (artefact.group as any)?.[locale] || '-' }}</td>
              <td>{{ artefact.version || '-' }}</td>
              <td>{{ typeof artefact.size === 'number' ? formatBytes(artefact.size, locale) : '-' }}</td>
              <td v-if="adminMode">
                <v-icon
                  :icon="artefact.public ? mdiEye : mdiEyeOff"
                  :color="artefact.public ? 'success' : 'warning'"
                  size="small"
                />
              </td>
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
      <v-card
        v-if="canManageKeys"
        class="mb-4"
      >
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
                  v-if="canManageKeys"
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
  browse: Parcourir
  apiKeys: "Cl\xE9s API"
  search: Rechercher
  category: "Cat\xE9gorie"
  group: Groupe
  recent: "R\xE9cents"
  name: Nom
  version: Version
  size: Taille
  visibility: "Visibilit\xE9"
  mirror: miroir
  deprecated: "d\xE9pr\xE9ci\xE9"
  showDeprecated: "Afficher les versions d\xE9pr\xE9ci\xE9es"
  dataUpdatedAt: "Donn\xE9es mises \xE0 jour"
  total: artefact(s)
  artefactsCount: "{count} artefact(s)"
  createKey: "Cr\xE9er une cl\xE9 de lecture"
  keyName: "Nom de la cl\xE9"
  create: "Cr\xE9er"
  keyCreated: "Cl\xE9 cr\xE9\xE9e avec succ\xE8s. Copiez-la maintenant :"
  keyWarning: "Cette cl\xE9 ne sera plus affich\xE9e apr\xE8s fermeture."
  existingKeys: "Cl\xE9s existantes"
  createdAt: "Cr\xE9\xE9 le"
  expiresAt: Expiration
en:
  browse: Browse
  apiKeys: API Keys
  search: Search
  category: Category
  group: Group
  recent: Recent
  name: Name
  version: Version
  size: Size
  visibility: Visibility
  mirror: mirror
  deprecated: deprecated
  showDeprecated: Show deprecated
  dataUpdatedAt: Data updated
  total: artefact(s)
  artefactsCount: "{count} artefact(s)"
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
import { mdiMagnify, mdiDelete, mdiEye, mdiEyeOff } from '@mdi/js'
import { VDateInput } from 'vuetify/labs/VDateInput'
import type { Artefact } from '#api/types'
import { useBreadcrumbs } from '~/composables/breadcrumbs'

const { t, locale } = useI18n()
const session = useSession()
const { dayjs } = useLocaleDayjs()

const adminMode = computed(() => !!session.state.user?.adminMode)

// Read keys can only be managed by an admin of the owner account: a user for
// their own account, or an organization admin at the organization root (a
// department session does not qualify). Mirrors the API permission check.
const canManageKeys = computed(() => {
  if (session.state.user?.adminMode) return true
  const account = session.state.account
  if (!account) return false
  if (account.type === 'user') return true
  return !account.department && session.state.accountRole === 'admin'
})

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
const showDeprecated = ref(false)
const pageSize = 20
const page = ref(1)

const categoryOptions = computed(() => categoryItems(locale.value))

const fetchParams = computed(() => ({
  size: pageSize,
  skip: (page.value - 1) * pageSize,
  sort: sort.value,
  ...(q.value ? { q: q.value } : {}),
  ...(category.value ? { category: category.value } : {}),
  ...(showDeprecated.value ? { includeDeprecated: true } : {})
}))

const artefactsFetch = useFetch<{ results: Artefact[], count: number }>(
  `${$apiPath}/v1/artefacts`,
  { query: fetchParams }
)

const nbPages = computed(() => {
  if (!artefactsFetch.data.value) return 0
  return Math.ceil(artefactsFetch.data.value.count / pageSize)
})

// Forward a breadcrumb to the integrating shell (data-fair) so the Registry tab
// is never left with an empty trail — mirrors the count breadcrumb that the
// processings/catalogs list pages emit.
useBreadcrumbs().setForPage(() => [
  { title: t('artefactsCount', { count: artefactsFetch.data.value?.count ?? 0 }) }
])

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
    const account = session.state.account!
    const body: Record<string, unknown> = {
      type: 'read',
      name: newKeyName.value,
      // owner accepts only type/id/name — sending the whole session account
      // (which also carries department fields) would be rejected by the schema.
      owner: { type: account.type, id: account.id, name: account.name }
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

<style scoped>
.artefact-row {
  position: relative;
}
.artefact-row-link {
  color: inherit;
  text-decoration: none;
}
/* Stretch the link over the whole row so the entire line is clickable while
   staying a real <a> — middle-click / open-in-new-tab / hover preview work. */
.artefact-row-link::after {
  content: "";
  position: absolute;
  inset: 0;
}
</style>
