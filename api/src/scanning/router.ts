import { Router } from 'express'
import { session } from '@data-fair/lib-express/index.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mongo from '#mongo'
import config from '#config'
import { getArtefactById } from '../artefacts/service.ts'
import { enqueueScan } from './service.ts'

// Mounted at /api/v1/artefacts/:id/scan (mergeParams to read :id).
const router = Router({ mergeParams: true })
export default router

// Full findings (admin only).
router.get('/', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const id = (req.params as { id: string }).id
    const scan = await mongo.artefactScans.findOne({ _id: id })
    if (!scan) throw httpError(404, 'no scan for this artefact')
    res.json(scan)
  } catch (err) { next(err) }
})

// Trigger an on-demand (re)scan (admin only).
router.post('/', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    if (!config.scanning?.enabled) throw httpError(503, 'scanning is not enabled on this deployment')
    const id = (req.params as { id: string }).id
    const artefact = await getArtefactById(id)
    if (!artefact) throw httpError(404, 'artefact not found')
    if (artefact.format !== 'npm') throw httpError(400, 'only npm artefacts can be scanned')
    await enqueueScan(id)
    res.status(202).json({ status: 'pending' })
  } catch (err) { next(err) }
})
