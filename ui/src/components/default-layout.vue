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
    <!-- Full-height flat admin button, as in simple-directory's app bar. -->
    <v-toolbar-items v-if="session.state.user?.adminMode">
      <v-btn
        :prepend-icon="mdiCog"
        variant="flat"
        color="admin"
        to="/admin"
      >
        {{ t('admin') }}
      </v-btn>
    </v-toolbar-items>
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
