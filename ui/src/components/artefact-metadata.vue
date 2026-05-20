<template>
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
</template>

<i18n lang="yaml">
fr:
  metadata: "M\xE9tadonn\xE9es"
  packageName: Nom du paquet
  latestVersion: "Derni\xE8re version"
  licence: Licence
  category: "Cat\xE9gorie"
  size: Taille
  dataUpdatedAt: "Donn\xE9es mises \xE0 jour le"
  description: Description
en:
  metadata: Metadata
  packageName: Package Name
  latestVersion: Latest Version
  licence: Licence
  category: Category
  size: Size
  dataUpdatedAt: Data updated
  description: Description
</i18n>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Artefact } from '#api/types'

const { artefact } = defineProps<{ artefact: Artefact }>()

const { t, locale } = useI18n()
const { dayjs } = useLocaleDayjs()

const description = computed(() => {
  const desc = (artefact as any).description
  if (!desc) return null
  return desc[locale.value] || desc.fr || desc.en || null
})
</script>
