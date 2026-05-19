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
 *   public artefacts plus those with a matching `privateAccess` entry.
 *   Downloads additionally require the account to hold an access-grant,
 *   UNLESS `internal` is set.
 * - `internal: true` → the account context came from a trusted sibling
 *   service (internal secret + `x-account`), not from an external API key or
 *   session. Such callers skip the access-grant requirement on downloads —
 *   only the artefact's own `public`/`privateAccess` gate applies. Always
 *   accompanied by `account`.
 * - `viaReadKey: true` → the caller authenticated with a read-type API key.
 *   This is the federation path: a remote registry mirroring artefacts from
 *   this one. Branch artefacts are hidden from these callers so dev builds
 *   never federate outward (see `artefactAccessFilter`).
 * - neither → anonymous. Only public artefacts are visible; no downloads.
 *
 * The same `Caller` shape is built from any auth path (session, read API
 * key, internal secret + `x-account`) by `resolveCaller(req)` in `auth.ts`.
 */
export type Caller = { admin: boolean, account?: Account, internal?: boolean, viaReadKey?: boolean }

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
  // Sender-side federation filter: branch artefacts never federate. A read
  // API key is the federation path, so we hide branch artefacts from those
  // callers regardless of their access scope.
  const base: Filter<Artefact> = caller.viaReadKey ? { format: { $ne: 'branch' } } : {}
  if (caller.admin) return base
  const orClauses: Filter<Artefact>[] = [{ public: true }]
  if (caller.account) {
    orClauses.push({
      privateAccess: { $elemMatch: { type: caller.account.type, id: caller.account.id } }
    })
  }
  return { ...base, $or: orClauses }
}

/**
 * True iff the caller can DOWNLOAD this artefact.
 *
 * Downloads require:
 *  - the artefact is public OR carries an explicit `privateAccess` for the
 *    caller's account, AND
 *  - the caller account holds a global access-grant — UNLESS the caller is a
 *    trusted internal sibling service (`caller.internal`), which is exempt
 *    from the grant requirement (the processings API/worker acting on behalf
 *    of a processing's owner must be able to fetch plugin tarballs without an
 *    operator manually enrolling every owner).
 *
 * Admins bypass everything. Anonymous callers can never download — even
 * public artefacts — because access-grants are the gate for any sustained
 * external consumption of registry data.
 */
export const canDownload = async (caller: Caller, artefact: Artefact): Promise<boolean> => {
  if (caller.admin) return true
  if (!caller.account) return false
  if (!caller.internal) {
    const grant = await mongo.accessGrants.findOne({
      'account.type': caller.account.type,
      'account.id': caller.account.id
    })
    if (!grant) return false
  }
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
