import type { Filter } from 'mongodb'
import type { Artefact } from '#types/artefact/index.ts'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mongo from '#mongo'

export type Account = { type: string, id: string, department?: string }

/**
 * Resolved caller view used by the artefact endpoints.
 *
 * - `admin: true` → bypass all access checks. Used for superadmin sessions
 *   and for internal-secret calls that did not set `x-account`.
 * - `account` set → caller acts on behalf of that account. Listing returns
 *   public artefacts plus those with a matching `privateAccess` entry;
 *   downloads additionally require the account to hold an access-grant.
 * - neither → anonymous. Only public artefacts are visible; no downloads.
 *
 * The same `Caller` shape is built from any auth path (session, read API
 * key, internal secret + `x-account`) by `resolveCaller(req)` in `auth.ts`.
 */
export type Caller = { admin: boolean, account?: Account }

/**
 * Mongo filter for *listing/reading* artefact metadata.
 *
 * Listing is governed by `public` + `privateAccess` only. Access-grants do
 * NOT gate listing — they only gate download capacity and read-key creation.
 * That keeps the catalog discoverable for accounts that haven't been
 * formally enrolled yet, while still hiding private artefacts from anyone
 * who isn't on their `privateAccess` list.
 */
export const artefactAccessFilter = (caller: Caller): Filter<Artefact> => {
  if (caller.admin) return {}
  const orClauses: Filter<Artefact>[] = [{ public: true }]
  if (caller.account) {
    orClauses.push({
      privateAccess: { $elemMatch: { type: caller.account.type, id: caller.account.id } }
    })
  }
  return { $or: orClauses }
}

/**
 * True iff the caller can DOWNLOAD this artefact.
 *
 * Downloads require both:
 *  - the caller account holds a global access-grant, AND
 *  - the artefact is public OR carries an explicit `privateAccess` for the
 *    caller's account.
 *
 * Admins bypass both checks. Anonymous callers can never download — even
 * public artefacts — because access-grants are the gate for any sustained
 * consumption of registry data.
 */
export const canDownload = async (caller: Caller, artefact: Artefact): Promise<boolean> => {
  if (caller.admin) return true
  if (!caller.account) return false
  const grant = await mongo.accessGrants.findOne({
    'account.type': caller.account.type,
    'account.id': caller.account.id
  })
  if (!grant) return false
  if (artefact.public) return true
  return !!artefact.privateAccess?.some(
    a => a.type === caller.account!.type && a.id === caller.account!.id
  )
}

export const assertDownloadAccess = async (caller: Caller, artefact: Artefact) => {
  if (!await canDownload(caller, artefact)) {
    throw httpError(403, 'no access to this artefact')
  }
}
