import dotenv from 'dotenv'
dotenv.config({ path: import.meta.resolve('../../.env').replace('file://', '') })

if (!process.env.DEV_API_PORT) throw new Error('missing DEV_API_PORT env variable, use "source dev/init-env.sh" to init .env file')

export default {
  port: process.env.DEV_API_PORT,
  privateDirectoryUrl: `http://localhost:${process.env.SD_PORT}`,
  privateEventsUrl: `http://localhost:${process.env.EVENTS_PORT}`,
  mongoUrl: `mongodb://localhost:${process.env.MONGO_PORT}/data-fair-registry-development`,
  dataDir: './data',
  // Vulnerability scanning is enabled in dev. Requires the osv-scanner binary
  // on PATH (see "Vulnerability scanner" in AGENTS.md for install). The offline
  // OSV DB is downloaded under dataDir on first scan. If osv-scanner is missing,
  // scans just record scan.status="error" and the rest of the app is unaffected.
  scanning: {
    enabled: true,
    osvScannerPath: 'osv-scanner',
    dbDir: './data/osv-db'
  },
  observer: {
    active: false
  },
  secretKeys: {
    events: 'secret-events',
    internalServices: 'secret-internal',
    apiKeysSalt: 'dev-api-keys-salt-minimum-32-chars!',
    cipherPassword: 'dev-cipher-password-minimum-32-ch!'
  },
  upgradeRoot: '../'
}
