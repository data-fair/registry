import { ref, readonly, watch, watchEffect, onUnmounted, toValue, type MaybeRefOrGetter } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import inIframe from '@data-fair/frame/lib/utils/in-iframe.js'

export type BreadcrumbItem = {
  title: string
  to?: RouteLocationRaw
  disabled?: boolean
}

const items = ref<BreadcrumbItem[]>([])

// Advanced iframe integration: when embedded in a parent frame, forward the
// breadcrumb trail so the parent renders it in its own chrome. Standalone, the
// trail is rendered locally in the app bar instead (see default-layout.vue).
if (inIframe) {
  watch(items, (value) => {
    window.parent.postMessage({
      breadcrumbs: value.map(item => ({
        text: item.title,
        ...(typeof item.to === 'string' ? { to: item.to } : {})
      }))
    }, '*')
  }, { immediate: true })
}

export const useBreadcrumbs = () => {
  const setForPage = (next: MaybeRefOrGetter<BreadcrumbItem[]>) => {
    watchEffect(() => { items.value = toValue(next) })
    onUnmounted(() => { items.value = [] })
  }
  return { items: readonly(items), setForPage }
}
