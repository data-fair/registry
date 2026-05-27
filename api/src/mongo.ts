import mongoLib from '@data-fair/lib-node/mongo.js'
import type { Binary } from 'mongodb'
import config from '#config'
import type { Artefact } from '#types/artefact/index.ts'
import type { ApiKey } from '#types/api-key/index.ts'
import type { AccessGrant } from '#types/access-grant/index.ts'
import type { RemoteRegistry } from '#types/remote-registry/index.ts'

export type Thumbnail = {
  _id: string
  artefactId: string
  data: Binary
  mimeType: 'image/webp' | 'image/svg+xml'
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
        // _id is the package name, so uniqueness on name is already enforced
        // by the primary key — no separate index needed. Fulltext spans the
        // identifier plus the i18n display fields, with weights tuned so the
        // technical handle dominates and description is a tiebreaker.
        fulltext: [{
          name: 'text',
          'title.fr': 'text',
          'title.en': 'text',
          'group.fr': 'text',
          'group.en': 'text',
          'description.fr': 'text',
          'description.en': 'text'
        }, {
          weights: {
            name: 10,
            'title.fr': 5,
            'title.en': 5,
            'group.fr': 3,
            'group.en': 3,
            'description.fr': 1,
            'description.en': 1
          }
        }]
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
