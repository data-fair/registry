import { type Ref } from 'vue'
import useWS from '@data-fair/lib-vue/ws.js'
import { $apiPath } from '~/context'

// Mirrors SyncEvent in api/src/remote-registries/sync.ts
export type SyncEvent = {
  running: boolean
  startedAt: string
  done: number
  total: number
  currentArtefact?: string
  lastSyncAt?: string
  lastSyncStatus?: 'success' | 'error'
  lastSyncError?: string
}

// Subscribes to a registry's sync channel and folds each event into the registry ref.
// `subscribe` registers its own onScopeDispose teardown, so callers need no onUnmounted.
// useWS returns undefined when the browser has no WebSocket: the page then renders correct
// state at load and simply does not animate.
export const useRegistrySync = (registryId: string, registry: Ref<any>) => {
  const ws = useWS($apiPath + '/')
  ws?.subscribe<SyncEvent>(`remote-registries/${encodeURIComponent(registryId)}/sync`, (event) => {
    const reg = registry.value
    // an event can land before the initial fetch resolves; the next one supersedes it
    if (!reg) return

    reg.syncProgress = {
      startedAt: event.startedAt,
      done: event.done,
      total: event.total,
      currentArtefact: event.currentArtefact
    }

    if (event.running) {
      reg.syncState = 'running'
      return
    }

    reg.syncState = 'idle'
    reg.lastSyncAt = event.lastSyncAt
    reg.lastSyncStatus = event.lastSyncStatus
    reg.lastSyncError = event.lastSyncError
  })
}
