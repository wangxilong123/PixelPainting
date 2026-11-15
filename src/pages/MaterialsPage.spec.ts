import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MaterialsPage from './MaterialsPage.vue'
import { presetArtworks } from '../data/artworks'
import { createAppRouter } from '../router'
import type { PixelArtwork } from '../models/artwork'
import { registerUserArtwork, unregisterUserArtwork } from '../services/artworkService'
import { publishArtwork, unpublishArtwork } from '../services/materialPublish'

beforeEach(() => {
  localStorage.clear()
})

async function mountPage() {
  const router = createAppRouter(createMemoryHistory())
  await router.push('/')
  await router.isReady()
  const wrapper = mount(MaterialsPage, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('MaterialsPage', () => {
  it('shows every artwork as a card with the total count', async () => {
    const { wrapper } = await mountPage()
    try {
      expect(wrapper.findAll('.artwork-card')).toHaveLength(presetArtworks.length)
      expect(wrapper.get('.materials-count').text()).toBe(`共 ${presetArtworks.length} 幅素材`)
      expect(wrapper.findAll('.card-title').map((node) => node.text()))
        .toEqual(presetArtworks.map((artwork) => artwork.title))
      expect(wrapper.find('.pager').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('filters by keyword against titles and tags and resets to the first page', async () => {
    const { wrapper } = await mountPage()
    try {
      await wrapper.get('input[type="search"]').setValue('企鹅')
      await flushPromises()
      const expected = presetArtworks.filter((artwork) => artwork.tags.includes('企鹅'))
      expect(wrapper.findAll('.artwork-card')).toHaveLength(expected.length)
      expect(wrapper.get('.materials-count').text()).toBe(`共 ${expected.length} 幅素材`)

      await wrapper.get('input[type="search"]').setValue('不存在的关键词')
      await flushPromises()
      expect(wrapper.findAll('.artwork-card')).toHaveLength(0)
      expect(wrapper.get('.materials-empty').text()).toContain('没有找到匹配的素材')
      expect(wrapper.get('.materials-count').text()).toBe('共 0 幅素材')

      await wrapper.get('.search-clear').trigger('click')
      await flushPromises()
      expect(wrapper.findAll('.artwork-card')).toHaveLength(presetArtworks.length)
    } finally {
      wrapper.unmount()
    }
  })

  it('opens free painting from a card', async () => {
    const { wrapper, router } = await mountPage()
    try {
      await wrapper.get(`a[href="/paint/${presetArtworks[1].id}"]`).trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('paint')
      expect(router.currentRoute.value.params.artworkId).toBe(presetArtworks[1].id)
    } finally {
      wrapper.unmount()
    }
  })

  it('shows published user artworks with a 我的 badge and counts them', async () => {
    const art: PixelArtwork = {
      id: 'user-mat-1',
      title: '我的作品',
      tags: ['原创'],
      width: 1,
      height: 1,
      palette: [{ id: 1, hex: '#FFCC66', name: '琥珀' }],
      cells: [1],
    }
    registerUserArtwork(art)
    publishArtwork(art.id)
    const { wrapper } = await mountPage()
    try {
      const cards = wrapper.findAll('.artwork-card')
      expect(cards).toHaveLength(presetArtworks.length + 1)
      expect(wrapper.get('.materials-count').text()).toBe(`共 ${presetArtworks.length + 1} 幅素材`)
      const last = cards[cards.length - 1]
      expect(last.find('.card-title').text()).toBe('我的作品')
      expect(last.find('.card-badge').text()).toBe('我的')
      expect(cards[0].find('.card-badge').exists()).toBe(false)
    } finally {
      wrapper.unmount()
      unpublishArtwork(art.id)
      unregisterUserArtwork(art.id)
    }
  })

  it('lays the cards out as a shortest-column masonry', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    })
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const { wrapper } = await mountPage()
    try {
      const grid = wrapper.get('.artwork-grid').element as HTMLElement
      Object.defineProperty(grid, 'clientWidth', { value: 1000, configurable: true })
      // 8 幅预设、4 列、间距 16 → 列宽 238、列左界 0/254/508/762
      const pattern = [100, 200, 150, 120, 300, 50, 180, 90]
      const cards = Array.from(grid.children) as HTMLElement[]
      cards.forEach((card, i) =>
        Object.defineProperty(card, 'offsetHeight', { value: pattern[i % pattern.length], configurable: true }))
      window.dispatchEvent(new Event('resize'))
      await flushPromises()
      await nextTick()

      expect(cards[0].style.position).toBe('absolute')
      expect(cards[0].style.width).toBe('238px')
      expect(cards[0].style.left).toBe('0px')
      expect(cards[0].style.top).toBe('0px')
      // 第 5 幅塞进最矮的第 0 列（top 116），不等最高行对齐
      expect(cards[4].style.left).toBe('0px')
      expect(cards[4].style.top).toBe('116px')
      // 最高列是第 0 列：100+16+300+16 = 432，容器高 432 − 16 = 416
      expect(grid.style.height).toBe('416px')
    } finally {
      wrapper.unmount()
      vi.unstubAllGlobals()
    }
  })
})