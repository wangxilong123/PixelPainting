import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import CollectionDetailPage from './CollectionDetailPage.vue'
import { createAppRouter } from '../router'
import { getCollectionById } from '../services/artworkService'

beforeEach(() => {
  localStorage.clear()
})

async function mountDetail(collectionId: string) {
  const router = createAppRouter(createMemoryHistory())
  await router.push(`/collections/${collectionId}`)
  await router.isReady()
  const wrapper = mount(CollectionDetailPage, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('CollectionDetailPage', () => {
  it('shows the collection heading and its artworks in artworkIds order', async () => {
    const { wrapper } = await mountDetail('col-animals')
    try {
      const expected = getCollectionById('col-animals')!.artworks
      expect(wrapper.get('.detail-heading h2').text()).toBe('动物伙伴')
      expect(wrapper.get('.detail-total').text()).toBe(`${expected.length} 幅素材`)
      expect(wrapper.get('.detail-count').text()).toBe(`共 ${expected.length} 幅素材`)
      expect(wrapper.findAll('.artwork-card')).toHaveLength(expected.length)
      expect(wrapper.findAll('.card-title').map((node) => node.text()))
        .toEqual(expected.map((artwork) => artwork.title))
      expect(wrapper.find('.pager').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('searches within the collection and shows an empty state', async () => {
    const { wrapper } = await mountDetail('col-animals')
    try {
      await wrapper.get('input[type="search"]').setValue('企鹅')
      await flushPromises()
      expect(wrapper.findAll('.artwork-card')).toHaveLength(2)
      expect(wrapper.get('.detail-count').text()).toBe('共 2 幅素材')

      await wrapper.get('input[type="search"]').setValue('不存在的关键词')
      await flushPromises()
      expect(wrapper.findAll('.artwork-card')).toHaveLength(0)
      expect(wrapper.get('.detail-empty').text()).toContain('没有匹配的素材')

      await wrapper.get('.search-clear').trigger('click')
      await flushPromises()
      expect(wrapper.findAll('.artwork-card')).toHaveLength(4)
    } finally {
      wrapper.unmount()
    }
  })

  it('falls back to a not-found state for an unknown collection id', async () => {
    const { wrapper } = await mountDetail('col-999')
    try {
      expect(wrapper.find('.collection-detail').exists()).toBe(false)
      expect(wrapper.get('.detail-missing').text()).toContain('未找到这个合集')
      expect(wrapper.get('.detail-back-link').attributes('href')).toBe('/collections')
    } finally {
      wrapper.unmount()
    }
  })

  it('returns to the collection list from the back link', async () => {
    const { wrapper, router } = await mountDetail('col-food')
    try {
      await wrapper.get('.detail-back').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('collections')
    } finally {
      wrapper.unmount()
    }
  })

  it('opens free painting from an artwork card', async () => {
    const { wrapper, router } = await mountDetail('col-food')
    try {
      await wrapper.get('a[href="/paint/art-004"]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('paint')
      expect(router.currentRoute.value.params.artworkId).toBe('art-004')
    } finally {
      wrapper.unmount()
    }
  })
})