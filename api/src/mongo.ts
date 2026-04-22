import mongoLib from '@data-fair/lib-node/mongo.js'
import type { Binary } from 'mongodb'
import config from '#config'
import type { Artefact } from '#types/artefact/index.ts'
import type { Version } from '#types/version/index.ts'
import type { ApiKey } from '#types/api-key/index.ts'
import type { AccessGrant } from '#types/access-grant/index.ts'
import type { RemoteRegistry } from '#types/remote-registry/index.ts'

export type Thumbnail = {
  _id: string
  artefactId: string
  data: Binary
  mimeType: 'image/webp'
  width: number
  height: number
  byteSize: number
  createdAt: string
}

export class RegistryMongo {
  get client () {
    return mongoLib.client
  }

  get db () {
    return mongoLib.db
  }

  get artefacts () {
    return mongoLib.db.collection<Artefact>('artefacts')
  }

  get versions () {
    return mongoLib.db.collection<Version>('versions')
  }

  get apiKeys () {
    return mongoLib.db.collection<ApiKey>('api-keys')
  }

  get accessGrants () {
    return mongoLib.db.collection<AccessGrant>('access-grants')
  }

  get thumbnails () {
    return mongoLib.db.collection<Thumbnail>('thumbnails')
  }

  get remoteRegistries () {
    return mongoLib.db.collection<RemoteRegistry>('remote-registries')
  }

  async connect () {
    await mongoLib.connect(config.mongoUrl)
  }

  async init () {
    await this.connect()
    await mongoLib.configure({
      artefacts: {
        'name-major': [{ name: 1, majorVersion: 1 }, { unique: true }],
        fulltext: { name: 'text' }
      },
      versions: {
        'artefact-version-arch': [{ artefactId: 1, version: 1, architecture: 1 }, { unique: true }]
      },
      'api-keys': {
        'hashed-key': [{ hashedKey: 1 }, { unique: true }],
        'short-id': [{ shortId: 1 }, { unique: true, sparse: true }]
      },
      'access-grants': {
        account: [{ 'account.type': 1, 'account.id': 1 }, { unique: true }]
      },
      thumbnails: {
        artefact: [{ artefactId: 1 }, { unique: true }]
      }
    })
  }
}

const registryMongo = new RegistryMongo()
export default registryMongo
