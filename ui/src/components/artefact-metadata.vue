<template>
  <v-card class="mb-4">
    <v-card-title class="d-flex align-center ga-2">
      {{ t('metadata') }}
      <v-chip
        v-if="artefact.hasNativeModules"
        color="warning"
        size="small"
      >
        {{ t('hasNativeModules') }}
      </v-chip>
      <v-spacer />
      <v-btn
        v-if="canDownload"
        color="primary"
        variant="flat"
        size="small"
        :prepend-icon="mdiDownload"
        :href="`${$apiPath}/v1/artefacts/${encodeURIComponent(artefact._id)}/download`"
      >
        {{ t('download') }}
      </v-btn>
    </v-card-title>
    <v-card-text>
      <!-- One compact grid for the technical facts; the tarball / file facts
           sit here too since an artefact carries exactly one blob. -->
      <v-row dense>
        <v-col
          v-for="field in fields"
          :key="field.label"
          cols="12"
          sm="6"
          md="4"
        >
          <div class="text-medium-emphasis text-caption">
            {{ field.label }}
          </div>
          <v-chip
            v-if="field.chip"
            size="small"
            :color="field.chip"
          >
            {{ field.value }}
          </v-chip>
          <div v-else>
            {{ field.value }}
          </div>
        </v-col>
        <v-col
          v-if="artefact.packageDescription"
          cols="12"
        >
          <div class="text-medium-emphasis text-caption">
            {{ t('packageDescription') }}
          </div>
          <div>{{ artefact.packageDescription }}</div>
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
  fileName: Fichier
  size: Taille
  dataUpdatedAt: "Donn\xE9es mises \xE0 jour le"
  uploadedBy: "T\xE9l\xE9vers\xE9 par"
  internal: service interne
  hasNativeModules: Modules natifs
  download: "T\xE9l\xE9charger"
  packageDescription: Description technique
en:
  metadata: Metadata
  packageName: Package name
  latestVersion: Latest version
  licence: Licence
  category: Category
  fileName: File
  size: Size
  dataUpdatedAt: Data updated
  uploadedBy: Uploaded by
  internal: internal service
  hasNativeModules: Native modules
  download: Download
  packageDescription: Technical description
</i18n>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { mdiDownload } from '@mdi/js'
import { categoryColor, categoryLabel } from '~/utils/categories'
import type { Artefact } from '#api/types'

const { artefact, canDownload } = defineProps<{ artefact: Artefact, canDownload: boolean }>()

const { t, locale } = useI18n()
const { dayjs } = useLocaleDayjs()
const session = useSession()
const adminMode = computed(() => !!session.state.user?.adminMode)

type Field = { label: string, value: string, chip?: string }
const fields = computed<Field[]>(() => {
  const out: Field[] = []
  if (artefact.format === 'npm') {
    out.push({ label: t('packageName'), value: artefact.packageName ?? '-' })
    out.push({ label: t('latestVersion'), value: artefact.version ?? '-' })
    out.push({ label: t('licence'), value: artefact.licence || '-' })
  } else if (artefact.fileName) {
    out.push({ label: t('fileName'), value: artefact.fileName })
  }
  out.push({ label: t('category'), value: categoryLabel(artefact.category, locale.value), chip: categoryColor(artefact.category) })
  out.push({ label: t('size'), value: typeof artefact.size === 'number' ? formatBytes(artefact.size, locale.value) : '-' })
  out.push({ label: t('dataUpdatedAt'), value: artefact.dataUpdatedAt ? dayjs(artefact.dataUpdatedAt).format('L LT') : '-' })
  // Who pushed the blob is an admin concern (api key names are internal).
  if (adminMode.value && artefact.uploadedBy) {
    out.push({ label: t('uploadedBy'), value: artefact.uploadedBy.apiKeyName ?? (artefact.uploadedBy.internal ? t('internal') : '-') })
  }
  return out
})
</script>
