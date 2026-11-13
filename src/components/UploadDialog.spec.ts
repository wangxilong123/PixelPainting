import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UploadDialog from './UploadDialog.vue'
import type { PixelArtwork } from '../models/artwork'
import { getArtworkById } from '../services/artworkService'
import { blobToPixelSource } from '../services/imageSource'
import type { PixelSource } from '../services/imageToLevel'

vi.mock('../services/imageSource', () => ({ blobToPixelSource: vi.fn() }))
const decode = vi.mocked(blobToPixelSource)

const red = [244, 162, 97, 255]
const green = [74, 157, 98, 255]
const brown = [69, 49, 47, 255]
const clear = [0, 0, 0, 0]

function pixelSource(width: number, height: number, pixels: number[][]): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4)
  pixels.forEach((pixel, index) => data.set(pixel, index * 4))
  return { width, height, data }
}

const small = pixelSource(4, 4, [
  red, red, green, green,
  red, red, green, clear,
  brown, brown, clear, clear,
  brown, red, clear, clear,
])

let ctx: Record<string, unknown>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  ctx = { clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), fillStyle: '', strokeStyle: '', lineWidth: 0 }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,TEST')
  decode.mockResolvedValue(small)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function mountDialog() {
  return mount(UploadDialog, { props: { open: true } })
}

async function selectFile(wrapper: ReturnType<typeof mountDialog>, name = '小橘猫.png') {
  const file = new File(['bytes'], name, { type: 'image/png' })
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

function saveButton(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper.findAll('button').find((node) => node.text().includes('保存作品'))!
}

describe('UploadDialog', () => {
  it('shows the dropzone and keeps save disabled before an image is chosen', () => {
    const wrapper = mountDialog()
    try {
      expect(wrapper.find('.dropzone').exists()).toBe(true)
      expect(wrapper.find('.preview-canvas').exists()).toBe(false)
      expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
    } finally {
      wrapper.unmount()
    }
  })

  it('decodes the chosen image, previews it and defaults the title to the filename', async () => {
    const wrapper = mountDialog()
    try {
      await selectFile(wrapper, '小橘猫.png')
      expect((wrapper.get('input[placeholder="给作品起个名字"]').element as HTMLInputElement).value).toBe('小橘猫')
      expect(wrapper.get('.preview-stats').text()).toContain('4×4')
      expect(wrapper.get('.preview-stats').text()).toContain('3 色')
      expect(saveButton(wrapper).attributes('disabled')).toBeUndefined()
      expect(ctx.fillRect).toHaveBeenCalled()
    } finally {
      wrapper.unmount()
    }
  })

  it('recomputes the preview after the grid slider settles', async () => {
    const medium = pixelSource(32, 8, Array.from({ length: 256 }, (_, i) => (i % 5 === 0 ? green : red)))
    decode.mockResolvedValue(medium)
    const wrapper = mountDialog()
    try {
      await selectFile(wrapper)
      expect(wrapper.get('.preview-stats').text()).toContain('32×8')
      await wrapper.findAll('input[type="range"]')[0].setValue(16)
      vi.advanceTimersByTime(120)
      await flushPromises()
      expect(wrapper.get('.preview-stats').text()).toContain('16×4')
    } finally {
      wrapper.unmount()
    }
  })

  it('saves with a generated id, thumbnail and parsed tags, then emits saved and close', async () => {
    const wrapper = mountDialog()
    try {
      await selectFile(wrapper)
      await wrapper.get('input[placeholder="给作品起个名字"]').setValue('作品A')
      await wrapper.get('input[placeholder="像素, 原创"]').setValue('像素, 原创，像素, 猫, 狗, 鸟, 鱼, 多余')
      await saveButton(wrapper).trigger('click')
      await flushPromises()

      const artwork = wrapper.emitted('saved')?.[0]?.[0] as PixelArtwork
      expect(artwork.id.startsWith('user-')).toBe(true)
      expect(artwork.title).toBe('作品A')
      expect(artwork.tags).toEqual(['像素', '原创', '猫', '狗', '鸟', '鱼'])
      expect(artwork.thumbnail).toBe('data:image/png;base64,TEST')
      expect(artwork.cells).toHaveLength(16)
      expect(wrapper.emitted('close')).toBeTruthy()
      expect(getArtworkById(artwork.id)?.title).toBe('作品A')
    } finally {
      wrapper.unmount()
    }
  })

  it('auto-splits a wide image into 3×3 and locks out the none option', async () => {
    const wide = pixelSource(80, 8, Array.from({ length: 640 }, (_, i) => (i % 7 === 0 ? green : red)))
    decode.mockResolvedValue(wide)
    const wrapper = mountDialog()
    try {
      await selectFile(wrapper)
      await wrapper.findAll('input[type="range"]')[0].setValue(128)
      vi.advanceTimersByTime(120)
      await flushPromises()

      expect(wrapper.get('select option[value="none"]').attributes('disabled')).toBeDefined()
      await saveButton(wrapper).trigger('click')
      await flushPromises()
      const artwork = wrapper.emitted('saved')?.[0]?.[0] as PixelArtwork
      expect(artwork.parts).toEqual({ cols: 3, rows: 3 })
      expect(artwork.width).toBe(80)
    } finally {
      wrapper.unmount()
    }
  })

  it('surfaces a decode error and keeps save disabled', async () => {
    decode.mockRejectedValue(new Error('无法读取这张图片，请换一张试试'))
    const wrapper = mountDialog()
    try {
      await selectFile(wrapper)
      expect(wrapper.get('.upload-error').text()).toContain('无法读取这张图片')
      expect(wrapper.find('.preview-canvas').exists()).toBe(false)
      expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
    } finally {
      wrapper.unmount()
    }
  })

  it('closes on Escape and on backdrop click', async () => {
    const wrapper = mountDialog()
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(wrapper.emitted('close')).toHaveLength(1)
      await wrapper.get('.upload-backdrop').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(2)
    } finally {
      wrapper.unmount()
    }
  })
})