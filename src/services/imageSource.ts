import type { PixelSource } from './imageToLevel'

// 解码上限：再大的图也先压到 4096 边长，避免 getImageData 吃掉几百 MB 内存
const MAX_DIMENSION = 4096

/** 把上传的图片 Blob 解码成 RGBA 像素源；透明像素保留，交给转换层决定空格。 */
export async function blobToPixelSource(blob: Blob): Promise<PixelSource> {
  if (blob.type && !blob.type.startsWith('image/')) {
    throw new Error('请选择图片文件（PNG、JPG、WebP 等）')
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    throw new Error('无法读取这张图片，请换一张试试')
  }
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器无法处理图片，请换一张试试')
    ctx.drawImage(bitmap, 0, 0, width, height)
    const { data } = ctx.getImageData(0, 0, width, height)
    return { width, height, data }
  } finally {
    bitmap.close()
  }
}