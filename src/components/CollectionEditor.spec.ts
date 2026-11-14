import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import CollectionEditor from './CollectionEditor.vue'
import { presetArtworks } from '../data/artworks'
import type { PixelArtwork } from '../models/artwork'
import type { UserCollection } from '../models/collection'
import { registerUserArtwork, unregisterUserArtwork } from '../services/artworkService'
import { loadUserCollections, saveUserCollection } from '../services/collectionStorage'

const userArtwork: PixelArtwork = {
  id: 'user-editor-test',
  title: '我的原创图',
  tags: ['原创'],
  width: 1,
  height: 1,
  palette: [{ id: 1, hex: '#FFCC66', name: '琥珀' }],
  cells: [1],
}

beforeEach(() => {
  localStorage.clear()
  loadUserCollections()
})

afterEach(() => {
  unregisterUserArtwork(userArtwork.id)
  localStorage.clear()
  loadUserCollections()
})

function mountEditor(collection: UserCollection | null = null) {
  return mount(CollectionEditor, { props: { open: true, collection } })
}

describe('CollectionEditor', () => {
  it('lists preset artworks as selectable tiles and gates saving behind title and members', async () => {
    const wrapper = mountEditor()
    try {
      expect(wrapper.findAll('.picker-tile')).toHaveLength(presetArtworks.length)
      const save = wrapper.get('.editor-actions .primary')
      expect(save.attributes('disabled')).toBeDefined()
      expect(wrapper.get('.editor-hint').text()).toBe('先给合集起个名字')

      await wrapper.findAll('input[type="text"]')[0].setValue('我的合集')
      expect(save.attributes('disabled')).toBeDefined()
      expect(wrapper.get('.editor-hint').text()).toBe('至少选一幅作品')

      await wrapper.findAll('.picker-tile')[0].trigger('click')
      expect(save.attributes('disabled')).toBeUndefined()
      expect(wrapper.get('.editor-hint').text()).toContain('已选 1 幅')
    } finally {
      wrapper.unmount()
    }
  })

  it('numbers selections in click order, toggles them off and saves the payload', async () => {
    const wrapper = mountEditor()
    try {
      const tiles = wrapper.findAll('.picker-tile')
      await tiles[1].trigger('click')
      await tiles[0].trigger('click')
      // 徽标按网格 DOM 顺序取：先点的 tiles[1] 是 1 号，后点的 tiles[0] 是 2 号
      expect(wrapper.findAll('.tile-order').map((node) => node.text())).toEqual(['2', '1'])
      expect(wrapper.findAll('.selected-item')).toHaveLength(2)
      expect(wrapper.get('.selected-cover-tag').text()).toBe('封面')

      // 再点一次取消选择，序号跟着重排
      await tiles[1].trigger('click')
      expect(wrapper.findAll('.selected-item')).toHaveLength(1)
      expect(wrapper.get('.tile-order').text()).toBe('1')

      await wrapper.findAll('input[type="text"]')[0].setValue('  测试合集  ')
      await wrapper.findAll('input[type="text"]')[1].setValue('原创, 测试，原创')
      await wrapper.get('.editor-actions .primary').trigger('click')
      await flushPromises()

      const saved = wrapper.emitted('saved')
      expect(saved).toHaveLength(1)
      const record = saved![0][0] as UserCollection
      expect(record.title).toBe('测试合集')
      expect(record.tags).toEqual(['原创', '测试'])
      expect(record.artworkIds).toEqual([presetArtworks[0].id])
      expect(wrapper.emitted('close')).toHaveLength(1)
      expect(JSON.parse(localStorage.getItem('pixel-painting:v1:collections')!)).toHaveLength(1)
    } finally {
      wrapper.unmount()
    }
  })

  it('reorders and removes members from the selected strip', async () => {
    const wrapper = mountEditor()
    try {
      const tiles = wrapper.findAll('.picker-tile')
      await tiles[0].trigger('click')
      await tiles[1].trigger('click')
      await tiles[2].trigger('click')
      const ids = () => wrapper.findAll('.selected-item .selected-title').map((node) => node.text())
      expect(ids()).toEqual([presetArtworks[0].title, presetArtworks[1].title, presetArtworks[2].title])

      const firstButtons = wrapper.findAll('.selected-item')[0].findAll('button')
      expect(firstButtons[0].attributes('disabled')).toBeDefined()
      await firstButtons[1].trigger('click')
      expect(ids()).toEqual([presetArtworks[1].title, presetArtworks[0].title, presetArtworks[2].title])

      await wrapper.findAll('.selected-item')[2].get('button[aria-label^="移除"]').trigger('click')
      expect(ids()).toEqual([presetArtworks[1].title, presetArtworks[0].title])

      await wrapper.get('.selected-clear').trigger('click')
      expect(wrapper.findAll('.selected-item')).toHaveLength(0)
      expect(wrapper.get('.selected-empty').text()).toContain('点选顺序')
    } finally {
      wrapper.unmount()
    }
  })

  it('filters members by source and by keyword', async () => {
    registerUserArtwork(userArtwork)
    const wrapper = mountEditor()
    try {
      const chips = wrapper.findAll('.picker-chip')
      expect(chips.map((chip) => chip.text())).toEqual([
        `全部 ${presetArtworks.length + 1}`,
        `素材 ${presetArtworks.length}`,
        '我的作品 1',
      ])

      await chips[2].trigger('click')
      expect(wrapper.findAll('.picker-tile')).toHaveLength(1)
      expect(wrapper.get('.tile-title').text()).toBe('我的原创图')
      expect(wrapper.get('.tile-source').text()).toBe('我的作品')

      await chips[1].trigger('click')
      expect(wrapper.findAll('.picker-tile')).toHaveLength(presetArtworks.length)

      await wrapper.get('input[type="search"]').setValue('企鹅')
      expect(wrapper.findAll('.picker-tile')).toHaveLength(2)
      await wrapper.get('input[type="search"]').setValue('不存在的关键词')
      expect(wrapper.findAll('.picker-tile')).toHaveLength(0)
      expect(wrapper.get('.picker-empty').text()).toContain('没有找到匹配的作品')
    } finally {
      wrapper.unmount()
    }
  })

  it('prefills every field in edit mode and keeps the collection id on save', async () => {
    const existing = saveUserCollection({
      title: '原有合集',
      tags: ['旧标签'],
      artworkIds: [presetArtworks[1].id, presetArtworks[0].id],
    })
    const wrapper = mountEditor(existing)
    try {
      const inputs = wrapper.findAll('input[type="text"]')
      expect((inputs[0].element as HTMLInputElement).value).toBe('原有合集')
      expect((inputs[1].element as HTMLInputElement).value).toBe('旧标签')
      expect(wrapper.findAll('.selected-item .selected-title').map((node) => node.text()))
        .toEqual([presetArtworks[1].title, presetArtworks[0].title])
      expect(wrapper.get('.editor-head h2').text()).toBe('编辑合集')

      await inputs[0].setValue('改过的合集')
      await wrapper.get('.editor-actions .primary').trigger('click')
      await flushPromises()
      const record = wrapper.emitted('saved')![0][0] as UserCollection
      expect(record.id).toBe(existing.id)
      expect(record.title).toBe('改过的合集')
      expect(record.artworkIds).toEqual([presetArtworks[1].id, presetArtworks[0].id])
    } finally {
      wrapper.unmount()
    }
  })

  it('closes on Escape and on backdrop click', async () => {
    const wrapper = mountEditor()
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(wrapper.emitted('close')).toHaveLength(1)

      await wrapper.get('.editor-backdrop').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(2)
    } finally {
      wrapper.unmount()
    }
  })
})