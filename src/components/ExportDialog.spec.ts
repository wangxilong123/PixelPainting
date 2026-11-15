import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ExportDialog from './ExportDialog.vue'
import type { PixelArtwork } from '../models/artwork'
import { artworkToDataUrl, downloadArtwork } from '../services/artworkExport'

vi.mock('../services/artworkExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/artworkExport')>()
  return { ...actual, artworkToDataUrl: vi.fn(), downloadArtwork: vi.fn() }
})

const toDataUrl = vi.mocked(artworkToDataUrl)
const download = vi.mocked(downloadArtwork)

const artwork: PixelArtwork = {
  id: 'user-a',
  title: '小橘猫',
  tags: ['动物'],
  width: 2,
  height: 2,
  palette: [{ id: 1, hex: '#F4A261', name: '橘' }],
  cells: [1, 1, 1, 0],
}

beforeEach(() => {
  toDataUrl.mockReset().mockReturnValue('data:image/png;base64,QUJD')
  download.mockReset().mockResolvedValue(2048)
})

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ExportDialog, { props: { open: true, artwork, ...props } })
}

function segment(wrapper: ReturnType<typeof mountDialog>, label: string) {
  return wrapper.findAll('.segment').find((node) => node.text() === label)!
}

function bgChip(wrapper: ReturnType<typeof mountDialog>, label: string) {
  return wrapper.findAll('.bg-chip').find((node) => node.text().includes(label))!
}

function downloadButton(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper.get('.export-actions button.primary')
}

describe('ExportDialog', () => {
  it('renders nothing when closed or without an artwork', () => {
    const closed = mountDialog({ open: false })
    const empty = mountDialog({ artwork: null })
    try {
      expect(closed.find('.export-backdrop').exists()).toBe(false)
      expect(empty.find('.export-backdrop').exists()).toBe(false)
    } finally {
      closed.unmount()
      empty.unmount()
    }
  })

  it('opens with PNG defaults, a live preview, output size and filename', () => {
    const wrapper = mountDialog()
    try {
      expect(wrapper.get('.export-dialog').attributes('aria-label')).toBe('下载像素图')
      expect(wrapper.get('.export-subtitle').text()).toContain('《小橘猫》')
      expect(wrapper.get('.export-subtitle').text()).toContain('2×2 格')
      expect(wrapper.get('.preview-img').attributes('src')).toBe('data:image/png;base64,QUJD')
      expect(wrapper.get('.preview-info').text()).toContain('16×16 px')
      expect(wrapper.get('.preview-name').text()).toBe('小橘猫.png')
      expect(segment(wrapper, 'PNG').attributes('aria-pressed')).toBe('true')
      expect(downloadButton(wrapper).attributes('disabled')).toBeUndefined()
      expect(toDataUrl).toHaveBeenLastCalledWith(artwork, expect.objectContaining({ format: 'png', scale: 8, background: null }))
    } finally {
      wrapper.unmount()
    }
  })

  it('switches format live, updating the filename and revealing quality only for lossy formats', async () => {
    const wrapper = mountDialog()
    try {
      expect(wrapper.find('input[aria-label="压缩质量"]').exists()).toBe(false)

      await segment(wrapper, 'JPG').trigger('click')
      expect(wrapper.get('.preview-name').text()).toBe('小橘猫.jpg')
      expect(wrapper.find('input[aria-label="压缩质量"]').exists()).toBe(true)
      expect(toDataUrl).toHaveBeenLastCalledWith(artwork, expect.objectContaining({ format: 'jpg' }))

      await segment(wrapper, 'WebP').trigger('click')
      expect(wrapper.get('.preview-name').text()).toBe('小橘猫.webp')
      expect(wrapper.find('input[aria-label="压缩质量"]').exists()).toBe(true)

      await segment(wrapper, 'PNG').trigger('click')
      expect(wrapper.find('input[aria-label="压缩质量"]').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('auto-switches transparent to white and disables the transparent chip for JPG', async () => {
    const wrapper = mountDialog()
    try {
      expect(bgChip(wrapper, '透明').attributes('aria-pressed')).toBe('true')
      await segment(wrapper, 'JPG').trigger('click')
      expect(bgChip(wrapper, '透明').attributes('disabled')).toBeDefined()
      expect(bgChip(wrapper, '白').attributes('aria-pressed')).toBe('true')
      expect(toDataUrl).toHaveBeenLastCalledWith(artwork, expect.objectContaining({ format: 'jpg', background: '#FFFFFF' }))

      await segment(wrapper, 'PNG').trigger('click')
      expect(bgChip(wrapper, '透明').attributes('disabled')).toBeUndefined()
    } finally {
      wrapper.unmount()
    }
  })

  it('updates output dimensions live as the scale slider moves', async () => {
    const wrapper = mountDialog()
    try {
      await wrapper.get('input[aria-label="放大倍率"]').setValue(4)
      expect(wrapper.get('.preview-info').text()).toContain('8×8 px')
      expect(toDataUrl).toHaveBeenLastCalledWith(artwork, expect.objectContaining({ scale: 4 }))
    } finally {
      wrapper.unmount()
    }
  })

  it('applies background chips and the custom color picker to the preview', async () => {
    const wrapper = mountDialog()
    try {
      await bgChip(wrapper, '黑').trigger('click')
      expect(toDataUrl).toHaveBeenLastCalledWith(artwork, expect.objectContaining({ background: '#000000' }))
      expect(wrapper.get('.preview-frame').classes()).toContain('opaque')

      await wrapper.get('input[aria-label="自定义背景颜色"]').setValue('#123456')
      expect(toDataUrl).toHaveBeenLastCalledWith(artwork, expect.objectContaining({ background: '#123456' }))
      expect(bgChip(wrapper, '自定义').attributes('aria-pressed')).toBe('true')
    } finally {
      wrapper.unmount()
    }
  })

  it('downloads with the current options and reports the saved filename and size', async () => {
    const wrapper = mountDialog()
    try {
      await downloadButton(wrapper).trigger('click')
      await flushPromises()
      expect(download).toHaveBeenCalledWith(artwork, expect.objectContaining({ format: 'png', scale: 8, background: null, quality: 0.92 }))
      const notice = wrapper.get('.export-notice').text()
      expect(notice).toContain('已保存 小橘猫.png')
      expect(notice).toContain('2.0 KB')
    } finally {
      wrapper.unmount()
    }
  })

  it('clears a previous success notice when an option changes', async () => {
    const wrapper = mountDialog()
    try {
      await downloadButton(wrapper).trigger('click')
      await flushPromises()
      expect(wrapper.find('.export-notice').exists()).toBe(true)
      await wrapper.get('input[aria-label="放大倍率"]').setValue(2)
      expect(wrapper.find('.export-notice').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('surfaces a download failure as an error', async () => {
    download.mockRejectedValue(new Error('导出失败，请重试'))
    const wrapper = mountDialog()
    try {
      await downloadButton(wrapper).trigger('click')
      await flushPromises()
      expect(wrapper.get('.export-error').text()).toContain('导出失败，请重试')
      expect(wrapper.find('.export-notice').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('shows a preview error and disables download when the canvas is unavailable', () => {
    toDataUrl.mockImplementation(() => {
      throw new Error('当前浏览器不支持画布导出')
    })
    const wrapper = mountDialog()
    try {
      expect(wrapper.get('.export-error').text()).toContain('当前浏览器不支持画布导出')
      expect(wrapper.find('.preview-img').exists()).toBe(false)
      expect(downloadButton(wrapper).attributes('disabled')).toBeDefined()
    } finally {
      wrapper.unmount()
    }
  })

  it('resets format, scale and background back to defaults', async () => {
    const wrapper = mountDialog()
    try {
      await segment(wrapper, 'JPG').trigger('click')
      await wrapper.get('input[aria-label="放大倍率"]').setValue(2)
      await bgChip(wrapper, '黑').trigger('click')
      await wrapper.get('.export-actions button.ghost').trigger('click')

      expect(segment(wrapper, 'PNG').attributes('aria-pressed')).toBe('true')
      expect((wrapper.get('input[aria-label="放大倍率"]').element as HTMLInputElement).value).toBe('8')
      expect(bgChip(wrapper, '透明').attributes('aria-pressed')).toBe('true')
      expect(wrapper.get('.preview-info').text()).toContain('16×16 px')
    } finally {
      wrapper.unmount()
    }
  })

  it('closes on Escape and on backdrop click', async () => {
    const wrapper = mountDialog()
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(wrapper.emitted('close')).toHaveLength(1)
      await wrapper.get('.export-backdrop').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(2)
    } finally {
      wrapper.unmount()
    }
  })
})