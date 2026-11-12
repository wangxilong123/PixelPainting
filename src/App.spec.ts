import { mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, it } from 'vitest'
import App from './App.vue'
import { createAppRouter } from './router'

const canvasStub = { template: '<div class="canvas-stub" />' }

async function mountApp(path: string) {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, {
    global: { plugins: [router], stubs: { PixelCanvas: canvasStub } },
  })
  return { wrapper, router }
}

describe('App', () => {
  it('opens the materials library at the root path with the section sidebar', async () => {
    const { wrapper, router } = await mountApp('/')
    try {
      expect(router.currentRoute.value.name).toBe('materials')
      expect(wrapper.get('main').text()).toContain('素材库')
      expect(wrapper.get('main').text()).toContain('橘猫')
      expect(wrapper.findAll('.sidebar-link')).toHaveLength(5)
      expect(wrapper.get('.sidebar-brand').text()).toContain('像素涂色')
    } finally {
      wrapper.unmount()
    }
  })

  it('hides the sidebar on the game and paint routes', async () => {
    const game = await mountApp('/game/level-001')
    try {
      expect(game.wrapper.find('.app-sidebar').exists()).toBe(false)
      expect(game.wrapper.find('.game-page').exists()).toBe(true)
    } finally {
      game.wrapper.unmount()
    }

    const paint = await mountApp('/paint/art-001')
    try {
      expect(paint.wrapper.find('.app-sidebar').exists()).toBe(false)
      expect(paint.wrapper.find('.game-page').exists()).toBe(true)
    } finally {
      paint.wrapper.unmount()
    }
  })

  it('registers the paint route with a dynamic artwork ID', () => {
    const router = createAppRouter(createMemoryHistory())
    const paint = router.resolve('/paint/art-001')

    expect(paint.name).toBe('paint')
    expect(paint.params.artworkId).toBe('art-001')
  })

  it('serves the upcoming sections from placeholder pages', async () => {
    for (const [path, title] of [['/collections', '合集'], ['/studio', '制作像素图'], ['/profile', '个人中心']]) {
      const { wrapper, router } = await mountApp(path)
      try {
        expect(router.currentRoute.value.meta.title).toBe(title)
        expect(wrapper.get('main').text()).toContain(title)
        expect(wrapper.get('main').text()).toContain('建设中')
        expect(wrapper.get('main a[href="/"]').text()).toBe('返回素材库')
      } finally {
        wrapper.unmount()
      }
    }
  })

  it('retires the old home page route', () => {
    const router = createAppRouter(createMemoryHistory())
    expect(router.resolve('/home').matched).toHaveLength(0)
  })
})