import neostandard from 'neostandard'
import dfLibRecommended from '@data-fair/lib-utils/eslint/recommended.js'

export default [
  { ignores: ['ui/*', '**/.type/', 'dev/*', 'node_modules/*', 'lib-node/**/*.js', 'lib-node/**/*.d.ts'] },
  ...dfLibRecommended,
  ...neostandard({ ts: true }),
  {
    // server code logs through @data-fair/lib-node/log.js (its README, "Logging")
    files: ['api/src/**/*.ts', 'api/index.ts'],
    rules: { 'no-console': 'error' }
  }
]
