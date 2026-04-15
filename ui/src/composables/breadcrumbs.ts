import { ref, readonly, watchEffect, onUnmounted, toValue, type MaybeRefOrGetter } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

export type BreadcrumbItem = {
  title: string
  to?: RouteLocationRaw
  disabled?: boolean
}

const items = ref<BreadcrumbItem[]>([])

export const useBreadcrumbs = () => {
  const setForPage = (next: MaybeRefOrGetter<BreadcrumbItem[]>) => {
    watchEffect(() => { items.value = toValue(next) })
    onUnmounted(() => { items.value = [] })
  }
  return { items: readonly(items), setForPage }
}
