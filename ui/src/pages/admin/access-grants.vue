<template>
  <v-container data-iframe-height>
    <admin-nav />

    <!-- Grant access -->
    <v-card class="mb-4">
      <v-card-title>{{ t('grantAccess') }}</v-card-title>
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-4">
          {{ t('grantAccessHelp') }}
        </p>
        <v-row>
          <v-col
            cols="12"
            sm="4"
          >
            <v-select
              v-model="newGrant.type"
              :items="accountTypes"
              :label="t('accountType')"
              density="compact"
              hide-details
              variant="outlined"
            />
          </v-col>
          <v-col
            cols="12"
            sm="4"
          >
            <v-text-field
              v-model="newGrant.id"
              :label="t('accountId')"
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
              :disabled="!newGrant.id || !newGrant.type"
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
              {{ grant.account.id }}
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
  </v-container>
</template>

<i18n lang="yaml">
fr:
  admin: Administration
  accessGrants: Accès accordés
  grantAccess: Accorder l'accès
  grantAccessHelp: Autoriser des comptes à télécharger les ressources du registre qui leur sont visibles. La visibilité est contrôlée séparément sur chaque artefact (public ou restreint) ; un accès accordé ici permet ensuite le téléchargement effectif des artefacts auxquels le compte a accès.
  accountType: Type de compte
  accountId: Identifiant du compte
  grant: Accorder
  existingGrants: Accès accordés
  account: Compte
  grantedBy: Accordé par
  grantedAt: Accordé le
en:
  admin: Administration
  accessGrants: Access Grants
  grantAccess: Grant Access
  grantAccessHelp: Authorize accounts to download registry resources visible to them. Visibility is controlled separately on each artefact (public or restricted); a grant here enables the actual download of the artefacts the account can see.
  accountType: Account Type
  accountId: Account ID
  grant: Grant
  existingGrants: Existing Grants
  account: Account
  grantedBy: Granted by
  grantedAt: Granted
</i18n>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { mdiDelete } from '@mdi/js'
import { useBreadcrumbs } from '~/composables/breadcrumbs'

const { t } = useI18n()
const session = useSession()
const { dayjs } = useLocaleDayjs()

if (!session.state.user?.adminMode) {
  throw new Error('Admin mode required')
}

useBreadcrumbs().setForPage(() => [
  { title: t('admin'), disabled: true },
  { title: t('accessGrants'), disabled: true }
])

const accountTypes = [
  { title: 'Organization', value: 'organization' },
  { title: 'User', value: 'user' }
]

const newGrant = ref({ type: 'organization', id: '' })
const revokingGrantId = ref<string | null>(null)

const grantsFetch = useFetch<{ results: any[], count: number }>(
  `${$apiPath}/v1/access-grants`
)

const grantAction = useAsyncAction(
  async () => {
    await $fetch('/v1/access-grants', {
      method: 'POST',
      body: { account: { type: newGrant.value.type, id: newGrant.value.id } }
    })
    newGrant.value = { type: 'organization', id: '' }
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
