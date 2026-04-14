<template>
  <v-container
    v-if="artefact"
    data-iframe-height
  >
    <v-app-bar density="comfortable">
      <v-btn
        :icon="mdiArrowLeft"
        @click="router.push('/admin/artefacts')"
      />
      <v-toolbar-title>{{ (artefact.title as any)?.[locale] || artefact.name }}</v-toolbar-title>
      <v-spacer />
      <personal-menu dark-mode-switch />
    </v-app-bar>

    <!-- Manifest metadata (read-only) -->
    <v-card class="mb-4">
      <v-card-title>{{ t('manifest') }}</v-card-title>
      <v-card-text>
        <v-row>
          <v-col
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
            cols="12"
            sm="6"
            md="4"
          >
            <div class="text-medium-emphasis text-body-2">
              {{ t('created') }}
            </div>
            <div>{{ dayjs(artefact.createdAt).format('L LT') }}</div>
          </v-col>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <div class="text-medium-emphasis text-body-2">
              {{ t('updated') }}
            </div>
            <div>{{ dayjs(artefact.updatedAt).format('L LT') }}</div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Editable metadata (VJSF) -->
    <v-card class="mb-4">
      <v-card-title>{{ t('editableMetadata') }}</v-card-title>
      <v-card-text>
        <v-form v-model="valid">
          <vjsf-patch-req
            v-model="editData"
            :options="vjsfOptions"
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!valid || !hasDiff"
          :loading="patchAction.loading.value"
          @click="patchAction.execute()"
        >
          {{ t('save') }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <!-- Access control -->
    <v-card class="mb-4">
      <v-card-title>{{ t('access') }}</v-card-title>
      <v-card-text>
        <private-access
          :public="artefact.public"
          :private-access="artefact.privateAccess"
          @update:public="onAccessChange('public', $event)"
          @update:private-access="onAccessChange('privateAccess', $event)"
        />
      </v-card-text>
    </v-card>

    <!-- Version list -->
    <v-card class="mb-4">
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
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Delete -->
    <v-card
      color="error"
      variant="outlined"
    >
      <v-card-title>{{ t('dangerZone') }}</v-card-title>
      <v-card-text>
        <v-btn
          color="error"
          variant="flat"
          :loading="deleteAction.loading.value"
          @click="confirmDelete = true"
        >
          {{ t('deleteArtefact') }}
        </v-btn>
      </v-card-text>
    </v-card>

    <v-dialog
      v-model="confirmDelete"
      max-width="400"
    >
      <v-card>
        <v-card-title>{{ t('confirmDeleteTitle') }}</v-card-title>
        <v-card-text>{{ t('confirmDeleteText', { name: artefact.name }) }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="confirmDelete = false">
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="deleteAction.loading.value"
            @click="deleteAction.execute()"
          >
            {{ t('delete') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>

  <v-container v-else-if="fetchLoading">
    <v-skeleton-loader type="card, card, card" />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  manifest: Métadonnées du manifeste
  packageName: Nom du paquet
  latestVersion: Dernière version
  licence: Licence
  category: Catégorie
  created: Créé le
  updated: Mis à jour le
  editableMetadata: Métadonnées éditables
  save: Enregistrer
  access: Contrôle d'accès
  versions: Versions
  version: Version
  architecture: Architecture
  uploadedAt: Téléversé le
  dangerZone: Zone de danger
  deleteArtefact: Supprimer l'artefact
  confirmDeleteTitle: Confirmer la suppression
  confirmDeleteText: "Voulez-vous vraiment supprimer l'artefact \"{name}\" et toutes ses versions ?"
  cancel: Annuler
  delete: Supprimer
  deleted: Artefact supprimé
  saved: Modifications enregistrées
en:
  manifest: Manifest Metadata
  packageName: Package Name
  latestVersion: Latest Version
  licence: Licence
  category: Category
  created: Created
  updated: Updated
  editableMetadata: Editable Metadata
  save: Save
  access: Access Control
  versions: Versions
  version: Version
  architecture: Architecture
  uploadedAt: Uploaded
  dangerZone: Danger Zone
  deleteArtefact: Delete Artefact
  confirmDeleteTitle: Confirm Deletion
  confirmDeleteText: "Are you sure you want to delete artefact \"{name}\" and all its versions?"
  cancel: Cancel
  delete: Delete
  deleted: Artefact deleted
  saved: Changes saved
</i18n>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { mdiArrowLeft } from '@mdi/js'
import personalMenu from '@data-fair/lib-vuetify/personal-menu.vue'
import type { VjsfOptions } from '@koumoul/vjsf/types.js'
import type { Artefact, Version } from '#api/types'

const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute('/admin/artefacts/[id]')
const session = useSession()
const { dayjs } = useLocaleDayjs()

if (!session.state.user?.adminMode) {
  throw new Error('Admin mode required')
}

const artefactId = computed(() => decodeURIComponent(route.params.id as string))

const artefact = ref<Artefact | null>(null)
const versions = ref<Version[]>([])
const editData = ref<Record<string, any>>({})
const originalEditData = ref<string>('')
const valid = ref(true)
const confirmDelete = ref(false)
const fetchLoading = ref(true)

const hasDiff = computed(() => {
  return JSON.stringify(editData.value) !== originalEditData.value
})

function categoryColor (cat: string) {
  const colors: Record<string, string> = { processing: 'blue', catalog: 'green', application: 'purple', tileset: 'teal', 'maplibre-style': 'orange', other: 'grey' }
  return colors[cat] || 'grey'
}

const vjsfOptions = computed<Partial<VjsfOptions>>(() => ({
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  readOnlyPropertiesMode: 'hide',
  initialValidation: 'always',
  locale: locale.value,
  xI18n: true
}))

async function fetchArtefact () {
  fetchLoading.value = true
  try {
    const data = await $fetch(`/v1/artefacts/${encodeURIComponent(artefactId.value)}`)
    artefact.value = data
    versions.value = data.versions || []
    editData.value = {
      title: data.title || {},
      description: data.description || {},
      thumbnail: data.thumbnail || undefined,
      category: data.category
    }
    originalEditData.value = JSON.stringify(editData.value)
  } finally {
    fetchLoading.value = false
  }
}

onMounted(fetchArtefact)

const patchAction = useAsyncAction(
  async () => {
    const body = { ...editData.value }
    if (body.title && !body.title.fr && !body.title.en) body.title = null
    if (body.description && !body.description.fr && !body.description.en) body.description = null
    if (!body.thumbnail) body.thumbnail = null

    await $fetch(`/v1/artefacts/${encodeURIComponent(artefactId.value)}`, {
      method: 'PATCH',
      body
    })
    await fetchArtefact()
  },
  { success: t('saved') }
)

async function onAccessChange (field: string, value: any) {
  const body: Record<string, any> = {}
  body[field] = value
  await $fetch(`/v1/artefacts/${encodeURIComponent(artefactId.value)}`, {
    method: 'PATCH',
    body
  })
  await fetchArtefact()
}

const deleteAction = useAsyncAction(
  async () => {
    await $fetch(`/v1/artefacts/${encodeURIComponent(artefactId.value)}`, {
      method: 'DELETE'
    })
    router.push('/admin/artefacts')
  },
  { success: t('deleted') }
)
</script>
