import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeCategory } from '../data/categories'
import { getCategories, getLevels } from '../services/levelService'

const levels = getLevels()
const categories = getCategories()
const [first, second] = levels

function levelsIn(categoryId: string) {
  return levels.filter((level) => normalizeCategory(level.category).id === categoryId)
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

async function mountPage() {
  const { createAppRouter } = await import('../router')
  const { default: LevelSelectPage } = await import('./LevelSelectPage.vue')
  const router = createAppRouter(createMemoryHistory())
  await router.push('/levels')
  await router.isReady()
  const wrapper = mount(LevelSelectPage, { global: { plugins: [router] } })
  return { wrapper, router }
}

async function completeFirstLevel() {
  const { useLevelProgress } = await import('../composables/useLevelProgress')
  const progress = useLevelProgress()
  progress.openLevel(first.id)
  for (const [index, color] of first.cells.entries()) {
    if (color !== 0) progress.paintCell(index, color)
  }
}

describe('LevelSelectPage', () => {
  it('shows every level in the carousel with a summary bar and marks locked levels', async () => {
    const { wrapper } = await mountPage()
    try {
      expect(wrapper.findAll('.chip').map((chip) => chip.text()))
        .toEqual(['全部', ...categories.map((category) => category.label)])
      expect(wrapper.find('.level-stats').text()).toContain(`已完成 0/${levels.length}`)
      expect(wrapper.find('.level-stats').text()).not.toContain('星')
      expect(wrapper.find('.level-stats').text()).not.toContain(first.title)

      const cards = wrapper.findAll('[data-level-id]')
      expect(cards.map((card) => card.attributes('data-level-id')))
        .toEqual(levels.map((level) => level.id))
      expect(cards[0].attributes('aria-disabled')).toBeUndefined()
      expect(cards[0].text()).toContain(`${first.width}×${first.height}`)
      expect(cards[1].attributes('aria-disabled')).toBe('true')
      expect(cards[1].text()).toContain('锁定')
      expect(cards[cards.length - 1].attributes('aria-disabled')).toBe('true')
    } finally {
      wrapper.unmount()
    }
  })

  it('filters the carousel by category', async () => {
    const { wrapper } = await mountPage()
    try {
      const chips = wrapper.findAll('.chip')
      for (const [index, category] of categories.entries()) {
        await chips[index + 1].trigger('click')
        expect(wrapper.findAll('[data-level-id]').map((card) => card.attributes('data-level-id')))
          .toEqual(levelsIn(category.id).map((level) => level.id))
      }

      await chips[0].trigger('click')
      expect(wrapper.findAll('[data-level-id]')).toHaveLength(levels.length)
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps the summary on the whole catalog while a filter is active', async () => {
    await completeFirstLevel()
    const { wrapper } = await mountPage()
    try {
      await wrapper.findAll('.chip')[1].trigger('click')
      expect(wrapper.find('.level-stats').text()).toContain(`已完成 1/${levels.length}`)
      expect(wrapper.findAll('[data-level-id]')).toHaveLength(levelsIn(categories[0].id).length)
    } finally {
      wrapper.unmount()
    }
  })

  it('shows completion after finishing a level and unlocks the next one', async () => {
    await completeFirstLevel()
    const { wrapper } = await mountPage()
    try {
      expect(wrapper.find('.level-stats').text()).toContain(`已完成 1/${levels.length}`)
      const cards = wrapper.findAll('[data-level-id]')
      expect(cards[0].text()).toContain('已完成')
      expect(cards[0].text()).not.toContain('★')
      expect(cards[1].attributes('aria-disabled')).toBeUndefined()
      expect(cards[cards.length - 1].attributes('aria-disabled')).toBe('true')
    } finally {
      wrapper.unmount()
    }
  })

  it('does not navigate for a locked level and routes to the game for an unlocked one', async () => {
    const { wrapper, router } = await mountPage()
    try {
      await wrapper.get(`[data-level-id="${second.id}"]`).trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/levels')

      await wrapper.get(`[data-level-id="${first.id}"]`).trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe(`/game/${first.id}`)
    } finally {
      wrapper.unmount()
    }
  })
})
