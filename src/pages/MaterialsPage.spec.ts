import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import MaterialsPage from './MaterialsPage.vue'
import { presetArtworks } from '../data/artworks'
import { createAppRouter } from '../router'

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
})