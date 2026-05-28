<template>
  <v-container
    v-if="artefact"
    data-iframe-height
  >
    <!-- Mirror banner (admin) -->
    <v-alert
      v-if="adminMode && artefact.origin"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      {{ t('mirroredFrom', { origin: artefact.origin }) }}
    </v-alert>

    <!-- Deprecation notice -->
    <v-alert
      v-if="artefact.deprecated"
      type="warning"
      variant="tonal"
      class="mb-4"
    >
      {{ t('deprecatedNotice') }}
    </v-alert>

    <!-- Download file artefact -->
    <v-card
      v-if="hasGrant && artefact.format === 'file' && artefact.path"
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
    <artefact-metadata :artefact="artefact" />

    <!-- Tarball (npm only) -->
    <v-card
      v-if="artefact.format === 'npm' && artefact.path"
      class="mb-4"
    >
      <v-card-title>
        {{ t('tarball') }}
        <v-chip
          v-if="artefact.hasNativeModules"
          color="warning"
          size="small"
          class="ml-2"
        >
          {{ t('hasNativeModules') }}
        </v-chip>
      </v-card-title>
      <v-card-text>
        <v-table density="compact">
          <thead>
            <tr>
              <th>{{ t('size') }}</th>
              <th>{{ t('uploadedAt') }}</th>
              <th v-if="adminMode">
                {{ t('uploadedBy') }}
              </th>
              <th v-if="hasGrant" />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{{ typeof artefact.size === 'number' ? formatBytes(artefact.size, locale) : '-' }}</td>
              <td>{{ artefact.dataUpdatedAt ? dayjs(artefact.dataUpdatedAt).format('L LT') : '-' }}</td>
              <td v-if="adminMode">
                {{ artefact.uploadedBy?.apiKeyName ?? (artefact.uploadedBy?.internal ? 'internal' : '') }}
              </td>
              <td
                v-if="hasGrant"
                class="text-right"
              >
                <v-btn
                  :icon="mdiDownload"
                  size="small"
                  variant="text"
                  :href="`${$apiPath}/v1/artefacts/${encodeURIComponent(artefactId)}/download`"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>

    <!-- Admin editing sections (thumbnail, editable metadata, danger zone) -->
    <artefact-admin
      v-if="adminMode"
      :artefact="artefact"
      @changed="fetchArtefact"
    />
  </v-container>

  <v-container v-else-if="fetchLoading">
    <v-skeleton-loader type="card, card, card" />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  artefacts: Artefacts
  tarball: Tarball
  hasNativeModules: "Modules natifs"
  size: Taille
  uploadedAt: "T\xE9l\xE9vers\xE9 le"
  uploadedBy: "T\xE9l\xE9vers\xE9 par"
  download: "T\xE9l\xE9charger"
  noAccessGrant: "Contactez votre administrateur pour obtenir un acc\xE8s aux t\xE9l\xE9chargements."
  loginRequired: "Connectez-vous pour acc\xE9der aux t\xE9l\xE9chargements."
  mirroredFrom: "Cet artefact est un miroir du registre distant : {origin}"
  deprecatedNotice: "Cet artefact est d\xE9pr\xE9ci\xE9. Il reste disponible mais n'est plus recommand\xE9."
en:
  artefacts: Artefacts
  tarball: Tarball
  hasNativeModules: "Has native modules"
  size: Size
  uploadedAt: Uploaded
  uploadedBy: Uploaded by
  download: Download
  noAccessGrant: Contact your administrator for download access.
  loginRequired: Log in to access downloads.
  mirroredFrom: "This artefact is mirrored from remote registry: {origin}"
  deprecatedNotice: "This artefact is deprecated. It remains available but is no longer recommended."
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
const adminMode = computed(() => !!session.state.user?.adminMode)

const artefact = ref<Artefact | null>(null)

useBreadcrumbs().setForPage(() => [
  { title: t('artefacts'), to: '/' },
  { title: (artefact.value?.title as any)?.[locale.value] || artefact.value?.name || artefactId.value, disabled: true }
])
const fetchLoading = ref(true)
const hasGrant = ref(false)

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
