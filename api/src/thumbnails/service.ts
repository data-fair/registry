import path from 'node:path'
import { Piscina } from 'piscina'
import type { ResizeInput, ResizeOutput } from './resize-thumbnail.ts'

const workerPath = path.resolve(import.meta.dirname, './resize-thumbnail.ts')

export const resizePiscina = new Piscina<ResizeInput, ResizeOutput>({
  filename: workerPath,
  minThreads: 0,
  maxThreads: 1,
  idleTimeout: 60 * 60 * 1000
})

export const resizeThumbnail = (input: ResizeInput) => resizePiscina.run(input)
