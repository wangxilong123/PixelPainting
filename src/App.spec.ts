import { mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, it } from 'vitest'
import App from './App.vue'
import { createAppRouter } from './router'

describe('App', () => {
  it('redirects the root path to the level list', async () => {
    const router = createAppRouter(createMemoryHistory())
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [router] } })
    try {
      expect(wrapper.get('h1').text()).toBe('像素涂色')
      expect(router.currentRoute.value.path).toBe('/levels')
      expect(wrapper.get('main').text()).toContain('橘猫')
      expect(wrapper.findAll('.app-nav a')).toHaveLength(1)
      expect(wrapper.get('a[href="/levels"]').text()).toBe('进入关卡列表')
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps the home page reachable at /home until the asset library lands', async () => {
    const router = createAppRouter(createMemoryHistory())
    await router.push('/home')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [router] } })
    try {
      expect(router.currentRoute.value.name).toBe('home')
      expect(wrapper.get('main').text()).toContain('开始游戏')
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
