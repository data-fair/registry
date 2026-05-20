export default {
  privateDirectoryUrl: 'http://simple-directory:8080',
  privateEventsUrl: undefined,
  mongoUrl: 'mongodb://localhost:27017/data-fair-registry',
  port: 8080,
  dataDir: '/data',
  maxUploadBytes: 200 * 1024 * 1024 * 1024,
  maxDecompressedBytes: 1024 * 1024 * 1024,
  maxTarEntries: 100_000,
  filesStorage: 'fs',
  s3: {
    region: '',
    endpoint: '',
    bucket: '',
    rootDir: '',
    credentials: {
      accessKeyId: '',
      secretAccessKey: ''
    },
    forcePathStyle: true
  },
  observer: {
    active: true,
    port: 9090
  },
  secretKeys: {
    events: undefined,
    internalServices: undefined,
    apiKeysSalt: undefined,
    cipherPassword: undefined
  },
  upgradeRoot: '/app/'
}
