import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { vuetifySessionOptions } from '@data-fair/lib-vuetify'
import '@data-fair/lib-vuetify/style/global.scss'
import { createVueRouterDFrameContent } from '@data-fair/frame/lib/vue-router/d-frame-content.js'
import { createReactiveSearchParams } from '@data-fair/lib-vue/reactive-search-params.js'
import { createLocaleDayjs } from '@data-fair/lib-vue/locale-dayjs.js'
import { createSession } from '@data-fair/lib-vue/session.js'
import { createUiNotif } from '@data-fair/lib-vue/ui-notif.js'
import { createHead } from '@unhead/vue/client'
import { createI18n } from 'vue-i18n'
import App from './App.vue'

;(async function () {
  const router = createRouter({ history: createWebHistory($sitePath + '/registry/'), routes })
  const dFrameContent = createVueRouterDFrameContent(router)
  const reactiveSearchParams = createReactiveSearchParams(router)
  const session = await createSession({ directoryUrl: $sitePath + '/simple-directory' })
  const localeDayjs = createLocaleDayjs(session.state.lang)
  const uiNotif = createUiNotif()
  const vuetify = createVuetify({
    ...vuetifySessionOptions(session, $cspNonce),
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } }
  })

  const i18n = createI18n({ locale: session.state.lang })
  const head = createHead()

  const app = createApp(App)
    .use(router)
    .use(dFrameContent)
    .use(reactiveSearchParams)
    .use(session)
    .use(localeDayjs)
    .use(uiNotif)
    .use(vuetify)
    .use(i18n)
    .use(head)

  await router.isReady()

  app.mount('#app')
})()
