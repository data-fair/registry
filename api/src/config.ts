import type { ApiConfig } from '../config/type/index.ts'
import { assertValid } from '../config/type/index.ts'
import config from 'config'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

assertValid(config, { lang: 'en', name: 'config', internal: true })

const typedConfig = config as ApiConfig

// Resolved working temp dir (mirrors the processings convention): an explicit
// tmpDir, else <dataDir>/tmp, else an OS temp fallback. The scan cache lives
// under <tmpDir>/scan-cache. Mount tmpDir as an emptyDir in k8s.
export const tmpDir = typedConfig.tmpDir ??
  (typedConfig.dataDir ? join(typedConfig.dataDir, 'tmp') : join(tmpdir(), 'data-fair-registry'))

export default typedConfig
