<template>
  <v-row class="ma-0">
    <v-checkbox
      v-model="localPublic"
      :label="t('public')"
      hide-details
      class="mr-4"
      color="primary"
      density="compact"
      @update:model-value="onChange"
    />
    <v-autocomplete
      v-if="!localPublic"
      v-model="localPrivateAccess"
      v-model:search="search"
      :items="suggestions"
      :loading="loading ? 'primary' : false"
      :item-title="(item: any) => item && `${item.name || item.id} (${item.type})`"
      :item-value="(item: any) => item && `${item.type}:${item.id}`"
      :label="t('privateAccess')"
      :placeholder="t('searchName')"
      density="compact"
      max-width="500"
      return-object
      hide-details
      hide-no-data
      multiple
      clearable
      @update:model-value="onChange"
    />
  </v-row>
</template>

<i18n lang="yaml">
fr:
  public: Public
  privateAccess: Vue restreinte à des comptes
  searchName: Saisissez un nom d'organisation / un utilisateur
en:
  public: Public
  privateAccess: Restricted access to some accounts
  searchName: Search an organization name / a user name
</i18n>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  public?: boolean
  privateAccess?: { type: string, id: string, name?: string }[]
}>()
const emit = defineEmits<{
  'update:public': [value: boolean]
  'update:privateAccess': [value: { type: string, id: string }[]]
}>()

const { t } = useI18n()

const loading = ref(false)
const search = ref('')
const suggestions = ref<any[]>([])

const localPublic = ref(props.public ?? false)
const localPrivateAccess = ref([...(props.privateAccess ?? [])])

watch(() => props.public, (v) => { localPublic.value = v ?? false })
watch(() => props.privateAccess, (v) => { localPrivateAccess.value = [...(v ?? [])] })

watch(search, async () => {
  await listSuggestions()
})

onMounted(async () => {
  await listSuggestions()
})

async function listSuggestions () {
  if (!search.value || search.value.length < 3) {
    suggestions.value = localPrivateAccess.value
    return
  }

  loading.value = true
  try {
    const orgsResponse = await $fetch('/simple-directory/api/organizations', {
      params: { q: search.value },
      baseURL: $sitePath
    })
    const orgs = orgsResponse.results.map((r: any) => ({ ...r, type: 'organization' }))
    const usersResponse = await $fetch('/simple-directory/api/users', {
      params: { q: search.value },
      baseURL: $sitePath
    })
    const users = usersResponse.results.map((r: any) => ({ ...r, type: 'user' }))
    suggestions.value = [...localPrivateAccess.value, ...orgs, ...users]
  } finally {
    loading.value = false
  }
}

function onChange () {
  search.value = ''
  emit('update:public', localPublic.value)
  emit('update:privateAccess', localPrivateAccess.value.map(a => ({ type: a.type, id: a.id })))
}
</script>
