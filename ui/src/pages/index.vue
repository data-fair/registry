<template>
  <v-container class="fill-height">
    <v-row
      align="center"
      justify="center"
    >
      <v-col
        cols="12"
        sm="8"
        md="6"
      >
        <v-card class="pt-8 pb-4 px-8">
          <v-card-title class="text-h4 text-center mb-4">
            Registry
          </v-card-title>
          <v-card-text class="text-center text-body-1">
            A simple registry for the data-fair stack.
          </v-card-text>
          <v-card-actions class="justify-center flex-column ga-2">
            <v-btn
              color="primary"
              variant="flat"
              to="/artefacts"
            >
              {{ t('browse') }}
            </v-btn>
            <v-btn
              v-if="session.state.user?.adminMode"
              variant="tonal"
              to="/admin/artefacts"
            >
              {{ t('admin') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  browse: Parcourir les artefacts
  admin: Administration
en:
  browse: Browse artefacts
  admin: Administration
</i18n>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const session = useSession()
</script>
