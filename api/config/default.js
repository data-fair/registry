export default {
  privateDirectoryUrl: 'http://simple-directory:8080',
  privateEventsUrl: undefined,
  mongoUrl: 'mongodb://localhost:27017/data-fair-registry',
  port: 8080,
  tmpDir: '/tmp',
  dataDir: '/data',
  maxUploadBytes: 500 * 1024 * 1024,
  filesStorage: 'fs',
  s3: {
    region: '',
    endpoint: '',
    bucket: '',
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
    internalServices: undefined
  },
  upgradeRoot: '/app/'
}
