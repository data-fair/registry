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
    <artefact-metadata
      :artefact="artefact"
      :can-download="hasGrant && !!artefact.path"
    />

    <!-- Admin edit form (metadata + thumbnail), ahead of the technical sections -->
    <artefact-edit
      v-if="adminMode"
      :artefact="artefact"
      @changed="fetchArtefact"
    />

    <!-- Admin tooling (vulnerability scan, danger zone) -->
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
  noAccessGrant: "Contactez votre administrateur pour obtenir un acc\xE8s aux t\xE9l\xE9chargements."
  loginRequired: "Connectez-vous pour acc\xE9der aux t\xE9l\xE9chargements."
  mirroredFrom: "Cet artefact est un miroir du registre distant : {origin}"
  deprecatedNotice: "Cet artefact est d\xE9pr\xE9ci\xE9. Il reste disponible mais n'est plus recommand\xE9."
en:
  artefacts: Artefacts
  tarball: Tarball
  noAccessGrant: Contact your administrator for download access.
  loginRequired: Log in to access downloads.
  mirroredFrom: "This artefact is mirrored from remote registry: {origin}"
  deprecatedNotice: "This artefact is deprecated. It remains available but is no longer recommended."
</i18n>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useBreadcrumbs } from '~/composables/breadcrumbs'
import type { Artefact } from '#api/types'

const { t, locale } = useI18n()
const route = useRoute('/artefacts/[id]')
const session = useSession()

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
