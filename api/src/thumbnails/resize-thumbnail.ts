import sharp from 'sharp'

export type ResizeInput = {
  data: Buffer
  mimetype: string
}

export type ResizeOutput = {
  data: Buffer
  width: number
  height: number
  mimeType: 'image/webp'
  byteSize: number
}

export const TARGET_WIDTH = 400
export const MAX_PIXELS = 50_000_000 // 50 megapixels

export default async function resizeThumbnail ({ data }: ResizeInput): Promise<ResizeOutput> {
  const image = sharp(data, { failOn: 'error' })
  const metadata = await image.metadata()
  const srcWidth = metadata.width ?? 0
  const srcHeight = metadata.height ?? 0
  if (!srcWidth || !srcHeight) throw new Error('INVALID_IMAGE_DIMENSIONS')
  if (srcWidth * srcHeight > MAX_PIXELS) throw new Error('IMAGE_EXCEEDS_PIXEL_LIMIT')

  const resized = await image
    .rotate()
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true })

  return {
    data: resized.data,
    width: resized.info.width,
    height: resized.info.height,
    mimeType: 'image/webp',
    byteSize: resized.data.byteLength
  }
}
