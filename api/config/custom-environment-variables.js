export default {
  mongoUrl: 'MONGO_URL',
  port: 'PORT',
  privateDirectoryUrl: 'PRIVATE_DIRECTORY_URL',
  privateEventsUrl: 'PRIVATE_EVENTS_URL',
  secretKeys: {
    events: 'SECRET_EVENTS',
    internalServices: 'SECRET_INTERNAL_SERVICES',
    apiKeysSalt: 'API_KEYS_SALT',
    cipherPassword: 'CIPHER_PASSWORD'
  },
  observer: {
    active: 'OBSERVER_ACTIVE',
    port: 'OBSERVER_PORT'
  },
  upgradeRoot: 'UPGRADE_ROOT',
  dataDir: 'DATA_DIR',
  maxUploadBytes: {
    __name: 'MAX_UPLOAD_BYTES',
    __format: 'number'
  },
  filesStorage: 'FILES_STORAGE',
  s3: {
    region: 'S3_REGION',
    endpoint: 'S3_ENDPOINT',
    bucket: 'S3_BUCKET',
    credentials: {
      accessKeyId: 'S3_ACCESS_KEY_ID',
      secretAccessKey: 'S3_SECRET_ACCESS_KEY'
    },
    forcePathStyle: 'S3_FORCE_PATH_STYLE'
  }
}
