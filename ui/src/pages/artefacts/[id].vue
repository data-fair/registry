<template>
  <v-container
    v-if="artefact"
    data-iframe-height
  >
    <v-app-bar density="comfortable">
      <v-btn
        :icon="mdiArrowLeft"
        to="/artefacts"
      />
      <v-toolbar-title>{{ (artefact.title as any)?.[locale] || artefact.name }}</v-toolbar-title>
      <v-spacer />
      <personal-menu dark-mode-switch />
    </v-app-bar>

    <!-- Download file artefact -->
    <v-card
      v-if="hasGrant && artefact.format === 'file' && artefact.filePath"
      class="mb-4"
    >
      <v-card-title>{{ t('download') }}</v-card-title>
      <v-card-text>
        <div class="d-flex align-center">
          <span class="text-body-1 mr-4">{{ artefact.fileName || artefact.name }}</span>
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

    <!-- Download latest npm version -->
    <v-card
      v-if="hasGrant && artefact.format !== 'file' && versions.length > 0"
      class="mb-4"
    >
      <v-card-title>{{ t('downloadLatest') }}</v-card-title>
      <v-card-text>
        <div class="d-flex align-center">
          <span class="text-body-1 mr-4">{{ latestVersion?.version }}</span>
          <v-btn
            color="primary"
            variant="flat"
            :prepend-icon="mdiDownload"
            :href="`${$apiPath}/v1/artefacts/${encodeURIComponent(artefactId)}/versions/${latestVersion?.version}/tarball`"
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
              {{ artefact.category }}
            </v-chip>
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

    <!-- Versions table (npm only) -->
    <v-card
      v-if="artefact.format !== 'file'"
      class="mb-4"
    >
      <v-card-title>
        {{ t('versions') }}
        <span class="text-medium-emphasis text-body-2 ml-2">({{ versions.length }})</span>
      </v-card-title>
      <v-table density="compact">
        <thead>
          <tr>
            <th>{{ t('version') }}</th>
            <th>{{ t('architecture') }}</th>
            <th>{{ t('uploadedAt') }}</th>
            <th v-if="hasGrant" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="v in versions"
            :key="v._id"
          >
            <td>
              <code>{{ v.version }}</code>
              <v-chip
                v-if="v.semverPrerelease"
                size="x-small"
                color="orange"
                class="ml-2"
              >
                pre
              </v-chip>
            </td>
            <td>{{ v.architecture || '-' }}</td>
            <td>{{ dayjs(v.uploadedAt).format('L LT') }}</td>
            <td
              v-if="hasGrant"
              class="text-right"
            >
              <v-btn
                :icon="mdiDownload"
                size="small"
                variant="text"
                :href="`${$apiPath}/v1/artefacts/${encodeURIComponent(artefactId)}/versions/${v.version}/tarball`"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
  </v-container>

  <v-container v-else-if="fetchLoading">
    <v-skeleton-loader type="card, card, card" />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  metadata: "M\xE9tadonn\xE9es"
  packageName: Nom du paquet
  latestVersion: "Derni\xE8re version"
  licence: Licence
  category: "Cat\xE9gorie"
  description: Description
  versions: Versions
  version: Version
  architecture: Architecture
  uploadedAt: "T\xE9l\xE9vers\xE9 le"
  downloadLatest: "T\xE9l\xE9charger la derni\xE8re version"
  download: "T\xE9l\xE9charger"
  noAccessGrant: "Contactez votre administrateur pour obtenir un acc\xE8s aux t\xE9l\xE9chargements."
  loginRequired: "Connectez-vous pour acc\xE9der aux t\xE9l\xE9chargements."
en:
  metadata: Metadata
  packageName: Package Name
  latestVersion: Latest Version
  licence: Licence
  category: Category
  description: Description
  versions: Versions
  version: Version
  architecture: Architecture
  uploadedAt: Uploaded
  downloadLatest: Download Latest
  download: Download
  noAccessGrant: Contact your administrator for download access.
  loginRequired: Log in to access downloads.
</i18n>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { mdiArrowLeft, mdiDownload } from '@mdi/js'
import personalMenu from '@data-fair/lib-vuetify/personal-menu.vue'
import type { Artefact, Version } from '#api/types'

const { t, locale } = useI18n()
const route = useRoute('/artefacts/[id]')
const session = useSession()
const { dayjs } = useLocaleDayjs()

const artefactId = computed(() => decodeURIComponent(route.params.id as string))

const artefact = ref<Artefact | null>(null)
const versions = ref<Version[]>([])
const fetchLoading = ref(true)
const hasGrant = ref(false)

const latestVersion = computed(() => versions.value.length > 0 ? versions.value[0] : null)

const description = computed(() => {
  if (!artefact.value) return null
  const desc = (artefact.value as any).description
  if (!desc) return null
  return desc[locale.value] || desc.fr || desc.en || null
})

function categoryColor (cat: string) {
  const colors: Record<string, string> = { processing: 'blue', catalog: 'green', application: 'purple', tileset: 'teal', 'maplibre-style': 'orange', other: 'grey' }
  return colors[cat] || 'grey'
}

async function fetchArtefact () {
  fetchLoading.value = true
  try {
    const data = await $fetch(`/v1/artefacts/${encodeURIComponent(artefactId.value)}`)
    artefact.value = data
    versions.value = data.versions || []
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
