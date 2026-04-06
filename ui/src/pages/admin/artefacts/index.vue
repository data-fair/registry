<template>
  <v-container data-iframe-height>
    <v-app-bar density="comfortable">
      <v-spacer />
      <personal-menu dark-mode-switch />
    </v-app-bar>

    <admin-nav />

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
          :items="categoryItems"
          clearable
          density="compact"
          hide-details
          :label="t('category')"
          variant="outlined"
        />
      </v-col>
      <v-col
        cols="auto"
      >
        <v-btn-toggle
          v-model="sort"
          color="primary"
          density="compact"
          mandatory
        >
          <v-btn value="updatedAt">
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
            <th>{{ t('visibility') }}</th>
            <th>{{ t('updatedAt') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="artefact in artefactsFetch.data.value.results"
            :key="artefact._id"
            style="cursor: pointer;"
            @click="router.push(`/admin/artefacts/${encodeURIComponent(artefact._id)}`)"
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
                {{ artefact.category }}
              </v-chip>
            </td>
            <td>{{ artefact.version }}</td>
            <td>
              <v-icon
                :icon="artefact.public ? mdiEye : mdiEyeOff"
                :color="artefact.public ? 'success' : 'warning'"
                size="small"
              />
            </td>
            <td>{{ dayjs(artefact.updatedAt).format('L LT') }}</td>
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
  </v-container>
</template>

<i18n lang="yaml">
fr:
  search: Rechercher
  category: Catégorie
  recent: Récents
  name: Nom
  version: Version
  visibility: Visibilité
  updatedAt: Mis à jour
  total: artefact(s)
en:
  search: Search
  category: Category
  recent: Recent
  name: Name
  version: Version
  visibility: Visibility
  updatedAt: Updated
  total: artefact(s)
</i18n>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { mdiMagnify, mdiEye, mdiEyeOff } from '@mdi/js'
import personalMenu from '@data-fair/lib-vuetify/personal-menu.vue'
import type { Artefact } from '#api/types'

const { t, locale } = useI18n()
const router = useRouter()
const session = useSession()
const { dayjs } = useLocaleDayjs()

if (!session.state.user?.adminMode) {
  throw new Error('Admin mode required')
}

const q = useStringSearchParam('q')
const category = useStringSearchParam('category')
const sort = ref('updatedAt')
const pageSize = 20
const page = ref(1)

const categoryItems = [
  { title: 'Processing', value: 'processing' },
  { title: 'Catalog', value: 'catalog' },
  { title: 'Application', value: 'application' },
  { title: 'Other', value: 'other' }
]

function categoryColor (cat: string) {
  const colors: Record<string, string> = { processing: 'blue', catalog: 'green', application: 'purple', other: 'grey' }
  return colors[cat] || 'grey'
}

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
</script>
