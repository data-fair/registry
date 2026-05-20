<template>
  <div class="pa-4">
    <!-- Grant access -->
    <v-card class="mb-4">
      <v-card-title>{{ t('grantAccess') }}</v-card-title>
      <v-card-text>
        <v-row>
          <v-col
            cols="12"
            sm="8"
          >
            <v-autocomplete
              v-model="selectedAccount"
              v-model:search="accountSearch"
              :items="accountItems"
              :item-props="accountItemProps"
              :loading="accountsFetch.loading.value"
              :label="t('searchAccount')"
              :no-data-text="t('noAccounts')"
              item-title="title"
              item-value="key"
              return-object
              no-filter
              clearable
              density="compact"
              hide-details
              variant="outlined"
            />
          </v-col>
          <v-col
            cols="auto"
            class="d-flex align-center"
          >
            <v-btn
              color="primary"
              variant="flat"
              :disabled="!selectedAccount"
              :loading="grantAction.loading.value"
              @click="grantAction.execute()"
            >
              {{ t('grant') }}
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Grant list -->
    <v-skeleton-loader
      v-if="grantsFetch.loading.value && !grantsFetch.data.value"
      type="table-tbody"
    />

    <v-card v-else-if="grantsFetch.data.value">
      <v-card-title>
        {{ t('existingGrants') }}
        <span class="text-medium-emphasis text-body-2 ml-2">({{ grantsFetch.data.value.count }})</span>
      </v-card-title>
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>{{ t('account') }}</th>
            <th>{{ t('grantedBy') }}</th>
            <th>{{ t('grantedAt') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="grant in grantsFetch.data.value.results"
            :key="grant._id"
          >
            <td>
              <v-chip
                size="small"
                :color="grant.account.type === 'organization' ? 'blue' : 'green'"
              >
                {{ grant.account.type }}
              </v-chip>
              {{ grant.account.name || grant.account.id }}
              <span
                v-if="grant.account.name"
                class="text-medium-emphasis text-body-2 ml-1"
              >{{ grant.account.id }}</span>
            </td>
            <td>{{ grant.grantedBy.name || grant.grantedBy.id }}</td>
            <td>{{ dayjs(grant.grantedAt).format('L LT') }}</td>
            <td class="text-right">
              <v-btn
                :icon="mdiDelete"
                color="error"
                size="small"
                variant="text"
                :loading="revokingGrantId === grant._id"
                @click="revokeGrant(grant._id)"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
  </div>
</template>

<i18n lang="yaml">
fr:
  grantAccess: Accorder l'accès
  searchAccount: Rechercher un compte
  noAccounts: Aucun compte trouvé
  grant: Accorder
  existingGrants: Accès accordés
  account: Compte
  grantedBy: Accordé par
  grantedAt: Accordé le
en:
  grantAccess: Grant Access
  searchAccount: Search an account
  noAccounts: No account found
  grant: Grant
  existingGrants: Existing Grants
  account: Account
  grantedBy: Granted by
  grantedAt: Granted
</i18n>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { mdiDelete, mdiAccount, mdiDomain } from '@mdi/js'
import { $sdUrl } from '~/context'

type AccountItem = { type: string, id: string, name: string, title: string, key: string }

const { t } = useI18n()
const { dayjs } = useLocaleDayjs()

const revokingGrantId = ref<string | null>(null)

// --- account search (simple-directory, same endpoint as the privateAccess form) ---
const selectedAccount = ref<AccountItem | null>(null)
const accountSearch = ref('')
const debouncedSearch = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(accountSearch, (value) => {
  // Selecting an item sets the search text to its title — don't re-query for it.
  if (selectedAccount.value && value === selectedAccount.value.title) return
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { debouncedSearch.value = value ?? '' }, 250)
})

const accountsFetch = useFetch<{ results: { type: string, id: string, name: string }[] }>(
  computed(() => {
    const params = new URLSearchParams({ size: '20' })
    if (debouncedSearch.value) params.set('q', debouncedSearch.value)
    return `${$sdUrl}/api/accounts?${params}`
  })
)

const accountItems = computed<AccountItem[]>(() =>
  (accountsFetch.data.value?.results ?? []).map((a) => ({
    type: a.type,
    id: a.id,
    name: a.name,
    title: `${a.name} (${a.id})`,
    key: `${a.type}:${a.id}`
  }))
)

const accountItemProps = (item: AccountItem) => ({
  title: item.name,
  subtitle: item.id,
  prependIcon: item.type === 'organization' ? mdiDomain : mdiAccount
})

const grantsFetch = useFetch<{ results: any[], count: number }>(
  `${$apiPath}/v1/access-grants`
)

const grantAction = useAsyncAction(
  async () => {
    if (!selectedAccount.value) return
    await $fetch('/v1/access-grants', {
      method: 'POST',
      body: {
        account: {
          type: selectedAccount.value.type,
          id: selectedAccount.value.id,
          name: selectedAccount.value.name
        }
      }
    })
    selectedAccount.value = null
    accountSearch.value = ''
    grantsFetch.refresh()
  }
)

async function revokeGrant (id: string) {
  revokingGrantId.value = id
  try {
    await $fetch(`/v1/access-grants/${id}`, { method: 'DELETE' })
    grantsFetch.refresh()
  } finally {
    revokingGrantId.value = null
  }
}
</script>
