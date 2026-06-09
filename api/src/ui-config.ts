import config from '#config'

// Injected into the SPA as window.__UI_CONFIG and read via $uiConfig in
// ui/src/context.ts. Keep this minimal and non-secret.
export const uiConfig = {
  scanning: { enabled: config.scanning?.enabled ?? false }
}

export type UiConfig = typeof uiConfig
export default uiConfig
