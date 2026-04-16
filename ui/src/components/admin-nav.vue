<template>
  <v-tabs
    :model-value="route.path"
    color="primary"
    density="comfortable"
    class="mb-4"
  >
    <v-tab
      :to="{ path: '/admin/artefacts' }"
      :value="'/admin/artefacts'"
    >
      {{ t('artefacts') }}
    </v-tab>
    <v-tab
      :to="{ path: '/admin/api-keys' }"
      :value="'/admin/api-keys'"
    >
      {{ t('apiKeys') }}
    </v-tab>
    <v-tab
      :to="{ path: '/admin/access-grants' }"
      :value="'/admin/access-grants'"
    >
      {{ t('accessGrants') }}
    </v-tab>
    <v-tab
      :to="{ path: '/admin/remote-registries' }"
      :value="'/admin/remote-registries'"
    >
      {{ t('remoteRegistries') }}
    </v-tab>
  </v-tabs>
</template>

<i18n lang="yaml">
fr:
  artefacts: Artefacts
  apiKeys: Clés API
  accessGrants: Accès accordés
  remoteRegistries: Registres distants
en:
  artefacts: Artefacts
  apiKeys: API Keys
  accessGrants: Access Grants
  remoteRegistries: Remote Registries
</i18n>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
</script>
