import type { PaletteColor } from '../models/level'

// 导出只依赖作品的像素数据（宽高 + 调色板 + cells），预设素材、用户作品、
// 上传对话框里的实时预览（Level）都满足这个最小形状，共用同一条渲染路径。
export type ExportSource = {
  title: string
  width: number
  height: number
  palette: PaletteColor[]
  cells: number[]
}

export type ExportFormatId = 'png' | 'jpg' | 'webp'

export type ExportFormat = {
  id: ExportFormatId
  label: string
  mime: string
  ext: string
  /** 是否支持透明通道；JPG 不支持，导出时必须铺底色 */
  alpha: boolean
}

export const exportFormats: readonly ExportFormat[] = [
  { id: 'png', label: 'PNG', mime: 'image/png', ext: 'png', alpha: true },
  { id: 'jpg', label: 'JPG', mime: 'image/jpeg', ext: 'jpg', alpha: false },
  { id: 'webp', label: 'WebP', mime: 'image/webp', ext: 'webp', alpha: true },
]

export const exportScales = [1, 2, 4, 8, 16] as const

export type ExportOptions = {
  format: ExportFormatId
  /** 整数倍率，保持像素硬边；输出尺寸 = 网格 × scale */
  scale: number
  /** 底色 hex；null 表示透明（仅 alpha 格式有效） */
  background: string | null
  /** 有损格式（JPG/WebP）的压缩质量 0–1 */
  quality?: number
}

export function getExportFormat(id: ExportFormatId): ExportFormat {
  return exportFormats.find((format) => format.id === id) ?? exportFormats[0]
}

/** 去掉文件系统非法字符，空标题回退「像素图」，长度夹到 40。 */
export function exportFileName(title: string, ext: string): string {
  const safe = title.trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').slice(0, 40)
  return `${safe || '像素图'}.${ext}`
}

/** 非 alpha 格式遇到透明底时强制铺白，避免 JPG 导出成黑底。 */
export function resolveBackground(format: ExportFormat, background: string | null): string | null {
  if (format.alpha) return background
  return background ?? '#FFFFFF'
}

export function renderArtworkCanvas(
  source: ExportSource,
  scale: number,
  background: string | null,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = source.width * scale
  canvas.height = source.height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持画布导出')
  ctx.imageSmoothingEnabled = false
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  const hexOf = new Map(source.palette.map((color) => [color.id, color.hex]))
  for (let i = 0; i < source.cells.length; i += 1) {
    const id = source.cells[i]
    if (id === 0) continue
    const hex = hexOf.get(id)
    if (!hex) continue
    ctx.fillStyle = hex
    ctx.fillRect((i % source.width) * scale, Math.floor(i / source.width) * scale, scale, scale)
  }
  return canvas
}

/** 预览用的同步 data URL；失败（不支持画布）抛错由调用方兜底。 */
export function artworkToDataUrl(source: ExportSource, options: ExportOptions): string {
  const format = getExportFormat(options.format)
  const canvas = renderArtworkCanvas(source, options.scale, resolveBackground(format, options.background))
  return canvas.toDataURL(format.mime, options.quality)
}

export function artworkToBlob(source: ExportSource, options: ExportOptions): Promise<Blob> {
  const format = getExportFormat(options.format)
  const canvas = renderArtworkCanvas(source, options.scale, resolveBackground(format, options.background))
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('导出失败，请重试'))
    }, format.mime, options.quality)
  })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 立即 revoke 个别浏览器会中断下载，留一拍再释放
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 渲染 → 编码 → 触发浏览器下载，返回实际文件大小（字节）供提示。 */
export async function downloadArtwork(source: ExportSource, options: ExportOptions): Promise<number> {
  const format = getExportFormat(options.format)
  const blob = await artworkToBlob(source, options)
  downloadBlob(blob, exportFileName(source.title, format.ext))
  return blob.size
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}