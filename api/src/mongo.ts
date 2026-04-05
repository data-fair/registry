import mongoLib from '@data-fair/lib-node/mongo.js'
import config from '#config'

export class RegistryMongo {
  get client () {
    return mongoLib.client
  }

  get db () {
    return mongoLib.db
  }

  async connect () {
    await mongoLib.connect(config.mongoUrl)
  }

  async init () {
    await this.connect()
    await mongoLib.configure({})
  }
}

const registryMongo = new RegistryMongo()
export default registryMongo
