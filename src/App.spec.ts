import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, it } from 'vitest'
import App from './App.vue'
import { createAppRouter } from './router'

describe('App', () => {
  it('renders the home page and navigates to the level list', async () => {
    const router = createAppRouter(createMemoryHistory())
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [router] } })
    try {
      expect(wrapper.get('h1').text()).toBe('像素涂色')
      expect(wrapper.get('main h2').text()).toBe('欢迎来到像素涂色')
      const link = wrapper.get('a[href="/levels"]')
      expect(link.text()).toBe('进入关卡列表')

      await link.trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.path).toBe('/levels')
      expect(wrapper.get('main h2').text()).toBe('关卡列表即将到来')
    } finally {
      wrapper.unmount()
    }
  })

  it('registers the game route with a dynamic level ID', () => {
    const router = createAppRouter(createMemoryHistory())
    const game = router.resolve('/game/level-001')

    expect(game.name).toBe('game')
    expect(game.params.levelId).toBe('level-001')
  })
})
