import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PixelArtwork } from '../models/artwork'

function makeArtwork(id: string, title: string, tags: string[] = []): PixelArtwork {
  return {
    id,
    title,
    tags,
    width: 2,
    height: 2,
    palette: [{ id: 1, hex: '#F4A261', name: '橘' }],
    cells: [1, 1, 1, 0],
  }
}

function original(): Blob {
  return new Blob(['fake-png-bytes'], { type: 'image/png' })
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
  vi.stubGlobal('indexedDB', new IDBFactory())
  // 让连续保存的 createdAt 严格递增：否则同毫秒会触发 byNewest 的 id 升序兜底，最新在前就不成立了
  let clock = 1_700_000_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function loadStudio() {
  const storage = await import('../services/artworkStorage')
  const { createAppRouter } = await import('../router')
  const { default: StudioPage } = await import('./StudioPage.vue')
  const { default: UploadDialog } = await import('../components/UploadDialog.vue')
  const publish = await import('../services/materialPublish')
  const service = await import('../services/artworkService')
  return { storage, createAppRouter, StudioPage, UploadDialog, publish, service }
}

async function mountStudio(StudioPage: any, createAppRouter: any) {
  const router = createAppRouter(createMemoryHistory())
  await router.push('/studio')
  await router.isReady()
  const wrapper = mount(StudioPage, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('StudioPage', () => {
  it('shows the first-run empty state and a session-only notice without IndexedDB', async () => {
    vi.unstubAllGlobals()
    const { createAppRouter, StudioPage } = await loadStudio()
    const { wrapper } = await mountStudio(StudioPage, createAppRouter)
    try {
      expect(wrapper.get('.studio-empty-first').text()).toContain('还没有自己的像素图')
      expect(wrapper.get('.studio-notice').text()).toContain('会话')
      expect(wrapper.get('.studio-count').text()).toBe('已制作 0 幅')
      expect(wrapper.find('.artwork-grid').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('lists saved works newest-first with search and an empty result state', async () => {
    const { storage, createAppRouter, StudioPage } = await loadStudio()
    await storage.saveUserArtwork(makeArtwork('user-a', '橘猫', ['动物']), original())
    await storage.saveUserArtwork(makeArtwork('user-b', '像素风景', ['风景']), original())
    const { wrapper } = await mountStudio(StudioPage, createAppRouter)
    try {
      expect(wrapper.findAll('.artwork-card')).toHaveLength(2)
      expect(wrapper.findAll('.card-title').map((node) => node.text())).toEqual(['像素风景', '橘猫'])
      expect(wrapper.get('.studio-count').text()).toBe('已制作 2 幅')

      await wrapper.get('input[type="search"]').setValue('动物')
      await flushPromises()
      expect(wrapper.findAll('.artwork-card')).toHaveLength(1)
      expect(wrapper.get('.card-title').text()).toBe('橘猫')

      await wrapper.get('input[type="search"]').setValue('不存在的关键词')
      await flushPromises()
      expect(wrapper.findAll('.artwork-card')).toHaveLength(0)
      expect(wrapper.get('.studio-empty').text()).toContain('没有找到匹配的作品')

      await wrapper.get('.search-clear').trigger('click')
      await flushPromises()
      expect(wrapper.findAll('.artwork-card')).toHaveLength(2)
    } finally {
      wrapper.unmount()
    }
  })

  it('deletes a work with a two-step confirm and restores it through undo', async () => {
    const { storage, createAppRouter, StudioPage } = await loadStudio()
    await storage.saveUserArtwork(makeArtwork('user-a', '橘猫'), original())
    await storage.saveUserArtwork(makeArtwork('user-b', '像素风景'), original())
    const { wrapper } = await mountStudio(StudioPage, createAppRouter)
    try {
      const firstDelete = wrapper.findAll('.studio-delete')[0]
      await firstDelete.trigger('click')
      expect(wrapper.findAll('.studio-delete.confirm')).toHaveLength(1)
      expect(wrapper.findAll('.artwork-card')).toHaveLength(2)

      await wrapper.get('.studio-delete.confirm').trigger('click')
      await vi.waitFor(() => {
        expect(wrapper.find('.studio-undo').exists()).toBe(true)
      }, { timeout: 5000 })
      await flushPromises()
      expect(wrapper.findAll('.artwork-card')).toHaveLength(1)
      expect(wrapper.get('.card-title').text()).toBe('橘猫')
      expect(wrapper.get('.studio-undo').text()).toContain('像素风景')
      expect(await storage.getUserArtwork('user-b')).toBeUndefined()

      await wrapper.get('.studio-undo button').trigger('click')
      await vi.waitFor(() => {
        expect(wrapper.findAll('.artwork-card')).toHaveLength(2)
      }, { timeout: 5000 })
      await flushPromises()
      expect(wrapper.findAll('.artwork-card')).toHaveLength(2)
      expect(wrapper.find('.studio-undo').exists()).toBe(false)
      const restored = await storage.getUserArtwork('user-b')
      expect(restored?.artwork.title).toBe('像素风景')
      expect(restored?.original).toBeDefined()
    } finally {
      wrapper.unmount()
    }
  })

  it('hands storage a raw artwork on undo so IndexedDB can clone it', async () => {
    const { storage, createAppRouter, StudioPage } = await loadStudio()
    const { isReactive } = await import('vue')
    await storage.saveUserArtwork(makeArtwork('user-a', '橘猫'), original())
    const saveSpy = vi.spyOn(storage, 'saveUserArtwork')
    const { wrapper } = await mountStudio(StudioPage, createAppRouter)
    try {
      await wrapper.get('.studio-delete').trigger('click')
      await wrapper.get('.studio-delete.confirm').trigger('click')
      await vi.waitFor(() => {
        expect(wrapper.find('.studio-undo').exists()).toBe(true)
      }, { timeout: 5000 })
      await flushPromises()
      saveSpy.mockClear()
      await wrapper.get('.studio-undo button').trigger('click')
      await vi.waitFor(() => {
        expect(saveSpy).toHaveBeenCalled()
      }, { timeout: 5000 })
      const [artworkArg] = saveSpy.mock.calls[saveSpy.mock.calls.length - 1]
      expect(isReactive(artworkArg)).toBe(false)
    } finally {
      wrapper.unmount()
      saveSpy.mockRestore()
    }
  })

  it('prepends a newly saved work and resets the search', async () => {
    const { storage, createAppRouter, StudioPage, UploadDialog } = await loadStudio()
    await storage.saveUserArtwork(makeArtwork('user-a', '橘猫', ['动物']), original())
    const { wrapper } = await mountStudio(StudioPage, createAppRouter)
    try {
      await wrapper.get('input[type="search"]').setValue('动物')
      await flushPromises()
      expect(wrapper.findAll('.artwork-card')).toHaveLength(1)

      const dialog = wrapper.findComponent(UploadDialog)
      const fresh = makeArtwork('user-new', '新作品', ['原创'])
      await storage.saveUserArtwork(fresh, original())
      dialog.vm.$emit('saved', fresh)
      dialog.vm.$emit('close')
      await flushPromises()

      expect((wrapper.get('input[type="search"]').element as HTMLInputElement).value).toBe('')
      expect(wrapper.findAll('.artwork-card')).toHaveLength(2)
      expect(wrapper.get('.card-title').text()).toBe('新作品')
      expect(wrapper.get('.studio-count').text()).toBe('已制作 2 幅')
    } finally {
      wrapper.unmount()
    }
  })

  it('opens the paint route from a work card', async () => {
    const { storage, createAppRouter, StudioPage } = await loadStudio()
    await storage.saveUserArtwork(makeArtwork('user-a', '橘猫'), original())
    const { wrapper, router } = await mountStudio(StudioPage, createAppRouter)
    try {
      await wrapper.get('a[href="/paint/user-a"]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('paint')
      expect(router.currentRoute.value.params.artworkId).toBe('user-a')
    } finally {
      wrapper.unmount()
    }
  })

  it('opens the export dialog for the work whose download button is clicked', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      imageSmoothingEnabled: false, fillStyle: '', fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,QUJD')
    const { storage, createAppRouter, StudioPage } = await loadStudio()
    await storage.saveUserArtwork(makeArtwork('user-a', '橘猫'), original())
    await storage.saveUserArtwork(makeArtwork('user-b', '像素风景'), original())
    const { wrapper } = await mountStudio(StudioPage, createAppRouter)
    try {
      expect(wrapper.find('.export-dialog').exists()).toBe(false)
      const downloads = wrapper.findAll('.studio-download')
      expect(downloads).toHaveLength(2)
      expect(downloads[0].attributes('aria-label')).toBe('下载《像素风景》')

      await downloads[0].trigger('click')
      await flushPromises()
      expect(wrapper.find('.export-dialog').exists()).toBe(true)
      expect(wrapper.get('.export-subtitle').text()).toContain('《像素风景》')
      expect(wrapper.get('.preview-img').attributes('src')).toBe('data:image/png;base64,QUJD')
    } finally {
      wrapper.unmount()
    }
  })

  it('publishes a work to the materials library and withdraws it', async () => {
    const { storage, createAppRouter, StudioPage, service } = await loadStudio()
    await storage.saveUserArtwork(makeArtwork('user-a', '橘猫'), original())
    const { wrapper } = await mountStudio(StudioPage, createAppRouter)
    try {
      expect(service.isPublishedMaterial('user-a')).toBe(false)
      const btn = wrapper.get('.studio-publish')
      expect(btn.classes()).not.toContain('published')
      expect(btn.attributes('aria-label')).toContain('上传')

      await btn.trigger('click')
      await flushPromises()
      expect(service.isPublishedMaterial('user-a')).toBe(true)
      expect(wrapper.get('.studio-publish').classes()).toContain('published')
      expect(wrapper.get('.studio-publish').attributes('aria-label')).toContain('撤回')

      await wrapper.get('.studio-publish').trigger('click')
      await flushPromises()
      expect(service.isPublishedMaterial('user-a')).toBe(false)
      expect(wrapper.get('.studio-publish').classes()).not.toContain('published')
    } finally {
      wrapper.unmount()
    }
  })

  it('unpublishes a work automatically when it is deleted', async () => {
    const { storage, createAppRouter, StudioPage, publish, service } = await loadStudio()
    await storage.saveUserArtwork(makeArtwork('user-a', '橘猫'), original())
    publish.publishArtwork('user-a')
    const { wrapper } = await mountStudio(StudioPage, createAppRouter)
    try {
      expect(service.isPublishedMaterial('user-a')).toBe(true)
      await wrapper.get('.studio-delete').trigger('click')
      await wrapper.get('.studio-delete.confirm').trigger('click')
      await vi.waitFor(() => {
        expect(wrapper.find('.studio-undo').exists()).toBe(true)
      }, { timeout: 5000 })
      expect(service.isPublishedMaterial('user-a')).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })
})