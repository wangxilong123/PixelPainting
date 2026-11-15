import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  artworkToBlob,
  artworkToDataUrl,
  downloadArtwork,
  downloadBlob,
  exportFileName,
  exportFormats,
  formatFileSize,
  getExportFormat,
  renderArtworkCanvas,
  resolveBackground,
  type ExportSource,
} from './artworkExport'

const source: ExportSource = {
  title: '小橘猫',
  width: 2,
  height: 2,
  palette: [
    { id: 1, hex: '#F4A261', name: '橘' },
    { id: 2, hex: '#4A9D62', name: '绿' },
  ],
  // (0,0)=橘 (1,0)=绿 (0,1)=空 (1,1)=橘
  cells: [1, 2, 0, 1],
}

type Fill = { x: number; y: number; w: number; h: number; style: string }

let fills: Fill[]
let ctx: { imageSmoothingEnabled: boolean; fillStyle: string; fillRect: ReturnType<typeof vi.fn> }
let toDataURL: ReturnType<typeof vi.spyOn>
let toBlob: ReturnType<typeof vi.spyOn>
let createObjectURL: ReturnType<typeof vi.fn>
let revokeObjectURL: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  fills = []
  ctx = {
    imageSmoothingEnabled: true,
    fillStyle: '',
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      fills.push({ x, y, w, h, style: ctx.fillStyle })
    }),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,QUJD')
  toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb, type) => {
    ;(cb as BlobCallback)(new Blob(['payload'], { type: type ?? 'image/png' }))
  })
  createObjectURL = vi.fn(() => 'blob:mock-url')
  revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('getExportFormat', () => {
  it('maps each id to its mime, extension and alpha support', () => {
    expect(getExportFormat('png')).toMatchObject({ mime: 'image/png', ext: 'png', alpha: true })
    expect(getExportFormat('jpg')).toMatchObject({ mime: 'image/jpeg', ext: 'jpg', alpha: false })
    expect(getExportFormat('webp')).toMatchObject({ mime: 'image/webp', ext: 'webp', alpha: true })
  })

  it('falls back to PNG for an unknown id', () => {
    expect(getExportFormat('bmp' as never).id).toBe('png')
  })

  it('exposes PNG, JPG and WebP in order', () => {
    expect(exportFormats.map((f) => f.id)).toEqual(['png', 'jpg', 'webp'])
  })
})

describe('exportFileName', () => {
  it('replaces filesystem-illegal characters with underscores', () => {
    expect(exportFileName('a/b\\c:d*e?f"g<h>i|j', 'png')).toBe('a_b_c_d_e_f_g_h_i_j.png')
  })

  it('collapses whitespace and trims', () => {
    expect(exportFileName('  小橘   猫  ', 'jpg')).toBe('小橘 猫.jpg')
  })

  it('caps the base name at 40 characters', () => {
    const name = exportFileName('猫'.repeat(60), 'webp')
    expect(name).toBe(`${'猫'.repeat(40)}.webp`)
  })

  it('falls back to 像素图 when the title is empty', () => {
    expect(exportFileName('   ', 'png')).toBe('像素图.png')
    expect(exportFileName('', 'png')).toBe('像素图.png')
  })
})

describe('resolveBackground', () => {
  it('keeps the background (including null) for alpha formats', () => {
    expect(resolveBackground(getExportFormat('png'), null)).toBeNull()
    expect(resolveBackground(getExportFormat('webp'), '#123456')).toBe('#123456')
  })

  it('forces white when a non-alpha format asks for transparency', () => {
    expect(resolveBackground(getExportFormat('jpg'), null)).toBe('#FFFFFF')
  })

  it('keeps an explicit background for non-alpha formats', () => {
    expect(resolveBackground(getExportFormat('jpg'), '#000000')).toBe('#000000')
  })
})

describe('renderArtworkCanvas', () => {
  it('sizes the canvas to grid × scale and disables smoothing', () => {
    const canvas = renderArtworkCanvas(source, 4, null)
    expect(canvas.width).toBe(8)
    expect(canvas.height).toBe(8)
    expect(ctx.imageSmoothingEnabled).toBe(false)
  })

  it('paints each non-empty cell at its scaled position with the palette hex', () => {
    renderArtworkCanvas(source, 4, null)
    expect(fills).toEqual([
      { x: 0, y: 0, w: 4, h: 4, style: '#F4A261' },
      { x: 4, y: 0, w: 4, h: 4, style: '#4A9D62' },
      { x: 4, y: 4, w: 4, h: 4, style: '#F4A261' },
    ])
  })

  it('fills the whole canvas with the background first when one is given', () => {
    renderArtworkCanvas(source, 2, '#FFFFFF')
    expect(fills[0]).toEqual({ x: 0, y: 0, w: 4, h: 4, style: '#FFFFFF' })
    expect(fills).toHaveLength(4)
  })

  it('skips cells whose palette id is unknown', () => {
    renderArtworkCanvas({ ...source, cells: [1, 9, 0, 2] }, 1, null)
    expect(fills).toEqual([
      { x: 0, y: 0, w: 1, h: 1, style: '#F4A261' },
      { x: 1, y: 1, w: 1, h: 1, style: '#4A9D62' },
    ])
  })

  it('throws when the 2d context is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(() => renderArtworkCanvas(source, 1, null)).toThrow('当前浏览器不支持画布导出')
  })
})

describe('artworkToDataUrl', () => {
  it('encodes with the format mime and quality, forcing white for JPG transparency', () => {
    artworkToDataUrl(source, { format: 'jpg', scale: 2, background: null, quality: 0.8 })
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.8)
    expect(fills[0]).toMatchObject({ style: '#FFFFFF' })
  })

  it('passes the PNG mime through without a forced background', () => {
    artworkToDataUrl(source, { format: 'png', scale: 1, background: null })
    expect(toDataURL).toHaveBeenCalledWith('image/png', undefined)
    expect(fills.every((f) => f.style !== '#FFFFFF')).toBe(true)
  })
})

describe('artworkToBlob', () => {
  it('resolves with the encoded blob and mime', async () => {
    const blob = await artworkToBlob(source, { format: 'webp', scale: 2, background: null, quality: 0.9 })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/webp')
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.9)
  })

  it('rejects when the browser produces no blob', async () => {
    toBlob.mockImplementation((cb: BlobCallback) => cb(null))
    await expect(artworkToBlob(source, { format: 'png', scale: 1, background: null })).rejects.toThrow('导出失败，请重试')
  })
})

describe('downloadBlob', () => {
  it('clicks a temporary anchor with the object URL and filename, then revokes after a beat', () => {
    const clicked: { href: string; download: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download })
    })
    const blob = new Blob(['x'], { type: 'image/png' })
    downloadBlob(blob, '作品.png')

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(clicked).toEqual([{ href: 'blob:mock-url', download: '作品.png' }])
    expect(document.querySelector('a')).toBeNull()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})

describe('downloadArtwork', () => {
  it('renders, encodes, downloads with a sanitized filename and returns the byte size', async () => {
    const clicked: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download)
    })
    const size = await downloadArtwork({ ...source, title: '橘/猫' }, { format: 'png', scale: 2, background: null })
    expect(clicked).toEqual(['橘_猫.png'])
    expect(size).toBe(new Blob(['payload']).size)
  })
})

describe('formatFileSize', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(1024 * 1024)).toBe('1.00 MB')
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3.00 MB')
  })
})