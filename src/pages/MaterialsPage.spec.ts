import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
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
})