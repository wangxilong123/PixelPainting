import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLevels } from '../services/levelService'

const [first, second, third] = getLevels()

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
  it('groups levels by category and marks locked levels', async () => {
    const { wrapper } = await mountPage()
    try {
      expect(wrapper.findAll('.level-group h2').map((node) => node.text()))
        .toEqual(['动物', '食物', '植物'])
      const cards = wrapper.findAll('[data-level-id]')
      expect(cards.map((card) => card.attributes('data-level-id')))
        .toEqual([first.id, second.id, third.id])
      expect(wrapper.text()).toContain('橘猫')
      expect(cards[0].attributes('aria-disabled')).toBeUndefined()
      expect(cards[1].attributes('aria-disabled')).toBe('true')
      expect(cards[1].text()).toContain('锁定')
      expect(cards[2].attributes('aria-disabled')).toBe('true')
    } finally {
      wrapper.unmount()
    }
  })

  it('shows stars and completion after finishing a level and unlocks the next one', async () => {
    await completeFirstLevel()
    const { wrapper } = await mountPage()
    try {
      const cards = wrapper.findAll('[data-level-id]')
      expect(cards[0].text()).toContain('★★★')
      expect(cards[0].text()).toContain('已完成')
      expect(cards[1].attributes('aria-disabled')).toBeUndefined()
      expect(cards[2].attributes('aria-disabled')).toBe('true')
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
