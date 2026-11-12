import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import CollectionsPage from './CollectionsPage.vue'
import { presetCollections } from '../data/collections'
import { createAppRouter } from '../router'

beforeEach(() => {
  localStorage.clear()
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
})