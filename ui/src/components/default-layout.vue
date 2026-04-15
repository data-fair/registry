<template>
  <v-app-bar density="comfortable">
    <v-app-bar-title>@data-fair/registry</v-app-bar-title>
    <v-spacer />
    <personal-menu dark-mode-switch />
  </v-app-bar>
  <v-breadcrumbs
    v-if="items.length"
    :items="items as any"
    density="compact"
  />
  <RouterView />
</template>

<script lang="ts" setup>
import personalMenu from '@data-fair/lib-vuetify/personal-menu.vue'
import { useBreadcrumbs } from '~/composables/breadcrumbs'

const { items } = useBreadcrumbs()
</script>
