import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import CollectionsPage from './CollectionsPage.vue'
import { presetCollections } from '../data/collections'
import type { PixelArtwork } from '../models/artwork'
import { createAppRouter } from '../router'
import { registerUserArtwork, unregisterUserArtwork } from '../services/artworkService'
import { loadUserCollections, saveUserCollection } from '../services/collectionStorage'

beforeEach(() => {
  localStorage.clear()
  loadUserCollections()
})

async function mountPage() {
  const router = createAppRouter(createMemoryHistory())
  await router.push('/collections')
  await router.isReady()
  const wrapper = mount(CollectionsPage, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('CollectionsPage', () => {
  it('lists every collection as a row card with the total count', async () => {
    const { wrapper } = await mountPage()
    try {
      expect(wrapper.findAll('.collection-card')).toHaveLength(presetCollections.length)
      expect(wrapper.get('.collections-count').text()).toBe(`共 ${presetCollections.length} 个合集`)
      expect(wrapper.findAll('.card-title').map((node) => node.text()))
        .toEqual(presetCollections.map((collection) => collection.title))
    } finally {
      wrapper.unmount()
    }
  })

  it('filters collections by title and tag and shows an empty state', async () => {
    const { wrapper } = await mountPage()
    try {
      await wrapper.get('input[type="search"]').setValue('动物')
      await flushPromises()
      expect(wrapper.findAll('.collection-card')).toHaveLength(1)
      expect(wrapper.get('.card-title').text()).toBe('动物伙伴')
      expect(wrapper.get('.collections-count').text()).toBe('共 1 个合集')

      await wrapper.get('input[type="search"]').setValue('不存在的关键词')
      await flushPromises()
      expect(wrapper.findAll('.collection-card')).toHaveLength(0)
      expect(wrapper.get('.collections-empty').text()).toContain('没有找到匹配的合集')

      await wrapper.get('.search-clear').trigger('click')
      await flushPromises()
      expect(wrapper.findAll('.collection-card')).toHaveLength(presetCollections.length)
    } finally {
      wrapper.unmount()
    }
  })

  it('opens a collection detail from a row card', async () => {
    const { wrapper, router } = await mountPage()
    try {
      await wrapper.get('a[href="/collections/col-animals"]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('collection-detail')
      expect(router.currentRoute.value.params.collectionId).toBe('col-animals')
    } finally {
      wrapper.unmount()
    }
  })

  it('creates a collection through the editor and lists it ahead of presets', async () => {
    const { wrapper } = await mountPage()
    try {
      await wrapper.get('.collections-add').trigger('click')
      await flushPromises()
      expect(wrapper.find('.editor-dialog').exists()).toBe(true)

      const tiles = wrapper.findAll('.picker-tile')
      await tiles[0].trigger('click')
      await tiles[1].trigger('click')
      await wrapper.findAll('.editor-dialog input[type="text"]')[0].setValue('我的专属合集')
      await wrapper.get('.editor-actions .primary').trigger('click')
      await flushPromises()

      expect(wrapper.find('.editor-dialog').exists()).toBe(false)
      expect(wrapper.findAll('.collection-card')).toHaveLength(presetCollections.length + 1)
      expect(wrapper.findAll('.card-title')[0].text()).toBe('我的专属合集')
      expect(wrapper.get('.cover-mine').text()).toBe('我的')
      expect(wrapper.get('.collections-count').text()).toBe(`共 ${presetCollections.length + 1} 个合集`)
      expect(wrapper.find('.collection-tools').exists()).toBe(true)
      expect(loadUserCollections()[0].artworkIds).toEqual(['art-004', 'art-005'])
    } finally {
      wrapper.unmount()
    }
  })

  it('edits a user collection in place from the row tools', async () => {
    const record = saveUserCollection({ title: '待编辑', tags: [], artworkIds: ['art-004'] })
    const { wrapper } = await mountPage()
    try {
      await wrapper.get('.collection-edit').trigger('click')
      await flushPromises()
      const input = wrapper.get('.editor-dialog input[type="text"]')
      expect((input.element as HTMLInputElement).value).toBe('待编辑')
      await input.setValue('编辑后的合集')
      await wrapper.get('.editor-actions .primary').trigger('click')
      await flushPromises()

      expect(wrapper.findAll('.card-title')[0].text()).toBe('编辑后的合集')
      expect(loadUserCollections()).toHaveLength(1)
      expect(loadUserCollections()[0].id).toBe(record.id)
    } finally {
      wrapper.unmount()
    }
  })

  it('deletes a user collection with two-step confirm and restores it via undo', async () => {
    saveUserCollection({ title: '待删除', tags: [], artworkIds: ['art-004'] })
    const { wrapper } = await mountPage()
    try {
      expect(wrapper.findAll('.collection-card')).toHaveLength(presetCollections.length + 1)

      await wrapper.get('.collection-delete').trigger('click')
      expect(wrapper.get('.collection-delete').text()).toContain('确认删除')
      expect(wrapper.findAll('.collection-card')).toHaveLength(presetCollections.length + 1)

      await wrapper.get('.collection-delete').trigger('click')
      await flushPromises()
      expect(wrapper.findAll('.collection-card')).toHaveLength(presetCollections.length)
      expect(wrapper.get('.collections-undo').text()).toContain('已删除《待删除》')

      await wrapper.get('.collections-undo button').trigger('click')
      await flushPromises()
      expect(wrapper.findAll('.collection-card')).toHaveLength(presetCollections.length + 1)
      expect(wrapper.findAll('.card-title')[0].text()).toBe('待删除')
      expect(wrapper.find('.collections-undo').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps preset collections read-only', async () => {
    const { wrapper } = await mountPage()
    try {
      expect(wrapper.find('.collection-tools').exists()).toBe(false)
      expect(wrapper.find('.cover-mine').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('covers user collections with the first member thumbnail, falling back to pixel preview', async () => {
    const artwork: PixelArtwork = {
      id: 'user-cover-test',
      title: '我的大图',
      tags: ['原创'],
      width: 1,
      height: 1,
      palette: [{ id: 1, hex: '#FFCC66', name: '琥珀' }],
      cells: [1],
      thumbnail: 'data:image/png;base64,COVER',
    }
    // 预设素材现在都带缩略图，无缩略图回退分支改用一幅合成用户小图
    const noThumb: PixelArtwork = {
      id: 'user-cover-no-thumb',
      title: '无缩略图小图',
      tags: ['原创'],
      width: 1,
      height: 1,
      palette: [{ id: 1, hex: '#FFCC66', name: '琥珀' }],
      cells: [1],
    }
    registerUserArtwork(artwork)
    registerUserArtwork(noThumb)
    try {
      saveUserCollection({ title: '有缩略图', tags: [], artworkIds: [artwork.id] })
      saveUserCollection({ title: '无缩略图', tags: [], artworkIds: [noThumb.id] })
      const { wrapper } = await mountPage()
      try {
        const cards = wrapper.findAll('.collection-card')
        const withThumb = cards.find((card) => card.find('.card-title').text() === '有缩略图')!
        const withoutThumb = cards.find((card) => card.find('.card-title').text() === '无缩略图')!
        expect(withThumb.get('.card-cover img.cover-img').attributes('src')).toBe(artwork.thumbnail)
        expect(withThumb.find('.card-cover .pixel-preview').exists()).toBe(false)
        expect(withoutThumb.find('.card-cover img.cover-img').exists()).toBe(false)
        expect(withoutThumb.find('.card-cover .pixel-preview').exists()).toBe(true)
      } finally {
        wrapper.unmount()
      }
    } finally {
      unregisterUserArtwork(artwork.id)
      unregisterUserArtwork(noThumb.id)
    }
  })
})