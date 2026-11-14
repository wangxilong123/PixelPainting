import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import CollectionDetailPage from './CollectionDetailPage.vue'
import type { PixelArtwork } from '../models/artwork'
import { createAppRouter } from '../router'
import { getCollectionById, registerUserArtwork, unregisterUserArtwork } from '../services/artworkService'
import { loadUserCollections, saveUserCollection } from '../services/collectionStorage'

beforeEach(() => {
  localStorage.clear()
  loadUserCollections()
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

describe('CollectionDetailPage user collections', () => {
  it('shows the mine tag, tools and members in order for a user collection', async () => {
    const record = saveUserCollection({ title: '我的合集', tags: ['原创'], artworkIds: ['art-002', 'art-001'] })
    const { wrapper } = await mountDetail(record.id)
    try {
      expect(wrapper.get('.detail-heading h2').text()).toBe('我的合集')
      expect(wrapper.get('.detail-mine-tag').text()).toBe('我的')
      expect(wrapper.get('.detail-total').text()).toBe('2 幅素材')
      expect(wrapper.findAll('.card-title').map((node) => node.text())).toEqual(['红苹果', '橘猫'])
      expect(wrapper.find('.detail-edit').exists()).toBe(true)
      expect(wrapper.find('.detail-delete').exists()).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps preset collections read-only', async () => {
    const { wrapper } = await mountDetail('col-animals')
    try {
      expect(wrapper.find('.detail-mine-tag').exists()).toBe(false)
      expect(wrapper.find('.detail-tools').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('edits the collection in place from the detail head', async () => {
    const record = saveUserCollection({ title: '原名', tags: [], artworkIds: ['art-001'] })
    const { wrapper } = await mountDetail(record.id)
    try {
      await wrapper.get('.detail-edit').trigger('click')
      await flushPromises()
      expect(wrapper.get('.editor-dialog').attributes('aria-label')).toBe('编辑合集')
      expect((wrapper.get('.editor-fields input').element as HTMLInputElement).value).toBe('原名')

      await wrapper.get('.editor-fields input').setValue('详情页改名')
      await wrapper.get('.editor-actions .primary').trigger('click')
      await flushPromises()
      expect(wrapper.find('.editor-backdrop').exists()).toBe(false)
      expect(wrapper.get('.detail-heading h2').text()).toBe('详情页改名')
      expect(getCollectionById(record.id)?.collection.title).toBe('详情页改名')
    } finally {
      wrapper.unmount()
    }
  })

  it('deletes with a two-step confirm and restores through the undo bar', async () => {
    const record = saveUserCollection({ title: '删了又恢复', tags: [], artworkIds: ['art-001'] })
    const { wrapper } = await mountDetail(record.id)
    try {
      await wrapper.get('.detail-delete').trigger('click')
      await flushPromises()
      expect(wrapper.get('.detail-delete').text()).toContain('确认删除')
      expect(wrapper.find('.detail-missing').exists()).toBe(false)

      await wrapper.get('.detail-delete').trigger('click')
      await flushPromises()
      expect(wrapper.find('.collection-detail').exists()).toBe(false)
      expect(wrapper.get('.detail-missing').text()).toContain('合集已删除')
      expect(wrapper.get('.detail-undo').text()).toContain('已删除《删了又恢复》')
      expect(getCollectionById(record.id)).toBeUndefined()

      await wrapper.get('.detail-undo button').trigger('click')
      await flushPromises()
      expect(wrapper.find('.detail-undo').exists()).toBe(false)
      expect(wrapper.get('.detail-heading h2').text()).toBe('删了又恢复')
      expect(getCollectionById(record.id)?.collection.id).toBe(record.id)
    } finally {
      wrapper.unmount()
    }
  })

  it('shows the first member thumbnail as the detail cover', async () => {
    const artwork: PixelArtwork = {
      id: 'user-detail-cover',
      title: '我的大图',
      tags: ['原创'],
      width: 1,
      height: 1,
      palette: [{ id: 1, hex: '#FFCC66', name: '琥珀' }],
      cells: [1],
      thumbnail: 'data:image/png;base64,COVER',
    }
    registerUserArtwork(artwork)
    try {
      const record = saveUserCollection({ title: '封面详情', tags: [], artworkIds: [artwork.id, 'art-001'] })
      const { wrapper } = await mountDetail(record.id)
      try {
        expect(wrapper.get('.detail-cover img').attributes('src')).toBe(artwork.thumbnail)
        expect(wrapper.find('.detail-cover .pixel-preview').exists()).toBe(false)
      } finally {
        wrapper.unmount()
      }
    } finally {
      unregisterUserArtwork(artwork.id)
    }
  })
})