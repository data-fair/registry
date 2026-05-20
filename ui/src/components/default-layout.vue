<template>
  <!-- App bar with brand + breadcrumb. Hidden when embedded: an integrating
       parent frame provides its own chrome and receives the breadcrumb trail
       via postMessage (see composables/breadcrumbs.ts). -->
  <v-app-bar
    v-if="!inIframe"
    density="comfortable"
  >
    <router-link
      to="/"
      class="text-h6 text-decoration-none mx-4"
      style="color: inherit; white-space: nowrap; flex: 0 0 auto;"
    >
      @data-fair/registry
    </router-link>
    <v-breadcrumbs
      v-if="items.length"
      :items="items as any"
      density="compact"
    />
    <v-spacer />
    <v-btn
      v-if="session.state.user?.adminMode"
      :prepend-icon="mdiCog"
      variant="text"
      color="admin"
      to="/admin"
      class="mr-2"
    >
      {{ t('admin') }}
    </v-btn>
    <personal-menu dark-mode-switch />
  </v-app-bar>
  <RouterView />
</template>

<i18n lang="yaml">
fr:
  admin: Administration
en:
  admin: Administration
</i18n>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { mdiCog } from '@mdi/js'
import inIframe from '@data-fair/frame/lib/utils/in-iframe.js'
import personalMenu from '@data-fair/lib-vuetify/personal-menu.vue'
import { useBreadcrumbs } from '~/composables/breadcrumbs'

const { t } = useI18n()
const session = useSession()
const { items } = useBreadcrumbs()
</script>
