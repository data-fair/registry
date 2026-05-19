<template>
  <v-container
    v-if="artefact"
    data-iframe-height
  >
    <!-- Download file artefact -->
    <v-card
      v-if="hasGrant && artefact.format === 'file' && artefact.filePath"
      class="mb-4"
    >
      <v-card-title>{{ t('download') }}</v-card-title>
      <v-card-text>
        <div class="d-flex align-center">
          <span class="text-body-1 mr-4">{{ artefact.fileName || artefact.name }}</span>
          <span
            v-if="typeof artefact.size === 'number'"
            class="text-medium-emphasis text-body-2 mr-4"
          >
            {{ formatBytes(artefact.size, locale) }}
          </span>
          <v-btn
            color="primary"
            variant="flat"
            :prepend-icon="mdiDownload"
            :href="`${$apiPath}/v1/artefacts/${encodeURIComponent(artefactId)}/download`"
          >
            {{ t('download') }}
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- No access alert -->
    <v-alert
      v-if="!hasGrant && session.state.account"
      type="info"
      class="mb-4"
    >
      {{ t('noAccessGrant') }}
    </v-alert>
    <v-alert
      v-if="!session.state.account"
      type="info"
      class="mb-4"
    >
      {{ t('loginRequired') }}
    </v-alert>

    <!-- Metadata -->
    <v-card class="mb-4">
      <v-card-title>{{ t('metadata') }}</v-card-title>
      <v-card-text>
        <v-row>
          <v-col
            v-if="artefact.format !== 'file'"
            cols="12"
            sm="6"
            md="4"
          >
            <div class="text-medium-emphasis text-body-2">
              {{ t('packageName') }}
            </div>
            <div>{{ artefact.packageName }}</div>
          </v-col>
          <v-col
            v-if="artefact.format !== 'file'"
            cols="12"
            sm="6"
            md="4"
          >
            <div class="text-medium-emphasis text-body-2">
              {{ t('latestVersion') }}
            </div>
            <div>{{ artefact.version }}</div>
          </v-col>
          <v-col
            v-if="artefact.format !== 'file'"
            cols="12"
            sm="6"
            md="4"
          >
            <div class="text-medium-emphasis text-body-2">
              {{ t('licence') }}
            </div>
            <div>{{ artefact.licence || '-' }}</div>
          </v-col>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <div class="text-medium-emphasis text-body-2">
              {{ t('category') }}
            </div>
            <v-chip
              size="small"
              :color="categoryColor(artefact.category)"
            >
              {{ categoryLabel(artefact.category, locale) }}
            </v-chip>
          </v-col>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <div class="text-medium-emphasis text-body-2">
              {{ t('size') }}
            </div>
            <div>{{ typeof artefact.size === 'number' ? formatBytes(artefact.size, locale) : '-' }}</div>
          </v-col>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <div class="text-medium-emphasis text-body-2">
              {{ t('dataUpdatedAt') }}
            </div>
            <div>{{ artefact.dataUpdatedAt ? dayjs(artefact.dataUpdatedAt).format('L LT') : '-' }}</div>
          </v-col>
          <v-col
            v-if="description"
            cols="12"
          >
            <div class="text-medium-emphasis text-body-2">
              {{ t('description') }}
            </div>
            <div>{{ description }}</div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Tarballs (npm only) -->
    <v-card
      v-if="artefact.format === 'npm'"
      class="mb-4"
    >
      <v-card-title>
        {{ t('tarballs') }}
        <span class="text-medium-emphasis text-body-2 ml-2">({{ Object.keys(artefact.tarballs ?? {}).length }})</span>
      </v-card-title>
      <v-card-text>
        <v-table density="compact">
          <thead>
            <tr>
              <th>{{ t('architecture') }}</th>
              <th>{{ t('size') }}</th>
              <th>{{ t('uploadedAt') }}</th>
              <th v-if="hasGrant" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(entry, arch) in artefact.tarballs ?? {}"
              :key="arch"
            >
              <td><code>{{ arch }}</code></td>
              <td>{{ typeof entry.size === 'number' ? formatBytes(entry.size, locale) : '-' }}</td>
              <td>{{ dayjs(entry.uploadedAt).format('L LT') }}</td>
              <td
                v-if="hasGrant"
                class="text-right"
              >
                <v-btn
                  :icon="mdiDownload"
                  size="small"
                  variant="text"
                  :href="`${$apiPath}/v1/artefacts/${encodeURIComponent(artefactId)}/tarball?architecture=${arch}`"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>
  </v-container>

  <v-container v-else-if="fetchLoading">
    <v-skeleton-loader type="card, card, card" />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  artefacts: Artefacts
  metadata: "M\xE9tadonn\xE9es"
  packageName: Nom du paquet
  latestVersion: "Derni\xE8re version"
  licence: Licence
  category: "Cat\xE9gorie"
  description: Description
  tarballs: Tarballs
  architecture: Architecture
  size: Taille
  dataUpdatedAt: "Donn\xE9es mises \xE0 jour le"
  uploadedAt: "T\xE9l\xE9vers\xE9 le"
  download: "T\xE9l\xE9charger"
  noAccessGrant: "Contactez votre administrateur pour obtenir un acc\xE8s aux t\xE9l\xE9chargements."
  loginRequired: "Connectez-vous pour acc\xE9der aux t\xE9l\xE9chargements."
en:
  artefacts: Artefacts
  metadata: Metadata
  packageName: Package Name
  latestVersion: Latest Version
  licence: Licence
  category: Category
  description: Description
  tarballs: Tarballs
  architecture: Architecture
  size: Size
  dataUpdatedAt: Data updated
  uploadedAt: Uploaded
  download: Download
  noAccessGrant: Contact your administrator for download access.
  loginRequired: Log in to access downloads.
</i18n>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { mdiDownload } from '@mdi/js'
import { useBreadcrumbs } from '~/composables/breadcrumbs'
import type { Artefact } from '#api/types'

const { t, locale } = useI18n()
const route = useRoute('/artefacts/[id]')
const session = useSession()
const { dayjs } = useLocaleDayjs()

const artefactId = computed(() => decodeURIComponent(route.params.id as string))

const artefact = ref<Artefact | null>(null)

useBreadcrumbs().setForPage(() => [
  { title: t('artefacts'), to: '/artefacts' },
  { title: (artefact.value?.title as any)?.[locale.value] || artefact.value?.name || artefactId.value, disabled: true }
])
const fetchLoading = ref(true)
const hasGrant = ref(false)

const description = computed(() => {
  if (!artefact.value) return null
  const desc = (artefact.value as any).description
  if (!desc) return null
  return desc[locale.value] || desc.fr || desc.en || null
})

async function fetchArtefact () {
  fetchLoading.value = true
  try {
    const data = await $fetch(`/v1/artefacts/${encodeURIComponent(artefactId.value)}`)
    artefact.value = data
  } finally {
    fetchLoading.value = false
  }
}

onMounted(async () => {
  if (session.state.user?.adminMode) {
    hasGrant.value = true
  } else if (session.state.account) {
    $fetch('/v1/access-grants/me').then(() => { hasGrant.value = true }).catch(() => {})
  }
  await fetchArtefact()
})
</script>
