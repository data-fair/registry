<template>
  <v-container data-iframe-height>
    <section-tabs
      id="vulnerabilities"
      :title="t('vulnerabilities')"
      :subtitle="t('vulnerabilitiesSubtitle')"
    >
      <template #content>
        <vulnerability-section />
      </template>
    </section-tabs>

    <section-tabs
      id="api-keys"
      :title="t('apiKeys')"
      :subtitle="t('apiKeysSubtitle')"
    >
      <template #content>
        <api-keys-section />
      </template>
    </section-tabs>

    <section-tabs
      id="access-grants"
      :title="t('accessGrants')"
      :subtitle="t('accessGrantsSubtitle')"
    >
      <template #content>
        <access-grants-section />
      </template>
    </section-tabs>

    <section-tabs
      id="remote-registries"
      :title="t('remoteRegistries')"
      :subtitle="t('remoteRegistriesSubtitle')"
    >
      <template #content>
        <remote-registries-section />
      </template>
    </section-tabs>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  admin: Administration
  vulnerabilities: "Vuln\xE9rabilit\xE9s"
  vulnerabilitiesSubtitle: "Synth\xE8se des analyses de vuln\xE9rabilit\xE9s des artefacts npm du parc."
  apiKeys: Clés API
  apiKeysSubtitle: Les clés d'upload permettent aux services externes de téléverser des artefacts dans le registre.
  accessGrants: Accès accordés
  accessGrantsSubtitle: Autoriser des comptes à télécharger les ressources du registre qui leur sont visibles. La visibilité est contrôlée séparément sur chaque artefact (public ou restreint) ; un accès accordé ici permet ensuite le téléchargement effectif des artefacts auxquels le compte a accès.
  remoteRegistries: Registres distants
  remoteRegistriesSubtitle: Synchronisez des artefacts depuis d'autres registres pour les mettre en miroir localement.
en:
  admin: Administration
  vulnerabilities: Vulnerabilities
  vulnerabilitiesSubtitle: Fleet-wide overview of npm artefact vulnerability scans.
  apiKeys: API Keys
  apiKeysSubtitle: Upload keys let external services push artefacts to the registry.
  accessGrants: Access Grants
  accessGrantsSubtitle: Authorize accounts to download registry resources visible to them. Visibility is controlled separately on each artefact (public or restricted); a grant here enables the actual download of the artefacts the account can see.
  remoteRegistries: Remote Registries
  remoteRegistriesSubtitle: Mirror artefacts locally by syncing from other registries.
</i18n>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SectionTabs from '@data-fair/lib-vuetify/section-tabs.vue'
import { useBreadcrumbs } from '~/composables/breadcrumbs'
import ApiKeysSection from '~/components/admin/api-keys-section.vue'
import AccessGrantsSection from '~/components/admin/access-grants-section.vue'
import RemoteRegistriesSection from '~/components/admin/remote-registries-section.vue'
import VulnerabilitySection from '~/components/admin/vulnerability-section.vue'

const { t } = useI18n()
const session = useSession()

if (!session.state.user?.adminMode) {
  throw new Error('Admin mode required')
}

useBreadcrumbs().setForPage(() => [
  { title: t('admin'), disabled: true }
])
</script>
