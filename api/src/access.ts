import type { Filter } from 'mongodb'
import type { Request } from 'express'
import type { Artefact } from '#types/artefact/index.ts'
import { reqSession } from '@data-fair/lib-express/session.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mongo from '#mongo'

export const artefactAccessFilter = async (req: Request): Promise<Filter<Artefact>> => {
  const sessionState = reqSession(req)

  // superadmin sees everything
  if (sessionState.user?.adminMode) return {}

  const orClauses: Filter<Artefact>[] = [{ public: true }]

  if (sessionState.account) {
    orClauses.push({
      privateAccess: {
        $elemMatch: { type: sessionState.account.type, id: sessionState.account.id }
      }
    })
  }

  return { $or: orClauses }
}

export const canDownload = async (req: Request, artefact: Artefact): Promise<boolean> => {
  const sessionState = reqSession(req)
  if (sessionState.user?.adminMode) return true

  if (!sessionState.account) return false

  const grant = await mongo.accessGrants.findOne({
    'account.type': sessionState.account.type,
    'account.id': sessionState.account.id
  })
  if (!grant) return false

  if (artefact.public) return true

  const hasPrivateAccess = artefact.privateAccess?.some(
    a => a.type === sessionState.account!.type && a.id === sessionState.account!.id
  )
  return !!hasPrivateAccess
}

export const assertDownloadAccess = async (req: Request, artefact: Artefact) => {
  if (!await canDownload(req, artefact)) {
    throw httpError(403, 'no access to this artefact')
  }
}
