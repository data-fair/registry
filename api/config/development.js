import dotenv from 'dotenv'
dotenv.config({ path: import.meta.resolve('../../.env').replace('file://', '') })

if (!process.env.DEV_API_PORT) throw new Error('missing DEV_API_PORT env variable, run "npm run dev-deps" to create the .env file from dev/default.env')

// The production env names (custom-environment-variables.js: MONGO_URL, PORT, DATA_DIR, SCANNING_ENABLED…)
// override these values: a dev environment that runs several services together sets them.

export default {
  port: process.env.DEV_API_PORT,
  privateDirectoryUrl: `http://localhost:${process.env.SD_PORT}`,
  mongoUrl: `mongodb://localhost:${process.env.MONGO_PORT}/data-fair-registry-development`,
  dataDir: './data',
  // Vulnerability scanning is enabled in dev, but dev/default.env turns it off
  // (SCANNING_ENABLED=false): set it to true in .env to work on it. Requires the
  // osv-scanner binary on PATH (see "Vulnerability scanner" in AGENTS.md for install).
  // The offline OSV DB is downloaded under dataDir on first scan. If osv-scanner is
  // missing, scans just record scan.status="error" and the rest of the app is unaffected.
  scanning: {
    enabled: true,
    osvScannerPath: 'osv-scanner',
    dbDir: './data/osv-db'
  },
  observer: {
    active: false
  },
  // the shared dev secrets of the data-fair services (data-fair-service skill, references/docker-compose.md)
  secretKeys: {
    internalServices: 'secret-registry-internal',
    apiKeysSalt: 'dev-api-keys-salt-0123456789abcdef01',
    cipherPassword: 'dev-cipher-password-0123456789abcdef'
  },
  upgradeRoot: '../'
}
