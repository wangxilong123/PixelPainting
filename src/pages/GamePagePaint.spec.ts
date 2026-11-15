import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PixelArtwork } from '../models/artwork'
import { presetArtworks } from '../data/artworks'
import { getLevels } from '../services/levelService'

const [artwork] = presetArtworks
const levels = getLevels()

vi.mock('../services/audioService', () => ({
  playPaintSound: vi.fn(),
  setSoundEnabled: vi.fn(),
  isSoundEnabled: () => true,
}))

function createCanvasStub() {
  return {
    name: 'PixelCanvas',
    props: {
      level: { type: Object, required: true },
      readPainted: { type: Function, required: true },
      commitPaint: { type: Function, required: true },
      selectedColorId: { type: Number, default: null },
      viewport: { type: Object, default: undefined },
      hintIndex: { type: Number, default: null },
      part: { type: Object, default: null },
      autoFit: { type: Boolean, default: false },
    },
    emits: ['paint', 'progress', 'completed', 'viewport-change'],
    template: '<div class="canvas-stub" />',
    methods: {
      zoomAt: () => {},
      panBy: () => {},
      resetViewport: () => {},
      centerOnCell: () => {},
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function mountPaint(artworkId: string) {
  const { createAppRouter } = await import('../router')
  const { default: GamePage } = await import('./GamePage.vue')
  const router = createAppRouter(createMemoryHistory())
  await router.push(`/paint/${artworkId}`)
  await router.isReady()
  const stub = createCanvasStub()
  const wrapper = mount(GamePage, {
    global: { plugins: [router], stubs: { PixelCanvas: stub } },
  })
  await flushPromises()
  return { wrapper, router, stub }
}

async function session() {
  const { useLevelProgress } = await import('../composables/useLevelProgress')
  return useLevelProgress()
}

// 先落到来源页再点进涂色，模拟真实导航；beforeEach 会记下来源，返回应按来源回原页面
async function mountPaintFrom(originPath: string, artworkId: string) {
  const { createAppRouter } = await import('../router')
  const { default: GamePage } = await import('./GamePage.vue')
  const router = createAppRouter(createMemoryHistory())
  await router.push(originPath)
  await router.push(`/paint/${artworkId}`)
  await router.isReady()
  const stub = createCanvasStub()
  const wrapper = mount(GamePage, {
    global: { plugins: [router], stubs: { PixelCanvas: stub } },
  })
  await flushPromises()
  return { wrapper, router, stub }
}

function button(wrapper: VueWrapper<any>, text: string) {
  const found = wrapper.findAll('button').find((node) => node.text().includes(text))
  if (!found) throw new Error(`未找到按钮：${text}`)
  return found
}

function paintAllTargets(canvas: VueWrapper<any>): void {
  const work = canvas.props('level') as PixelArtwork
  const readPainted = canvas.props('readPainted') as () => readonly number[]
  const commitPaint = canvas.props('commitPaint') as (index: number, colorId: number) => string
  for (const [index, color] of work.cells.entries()) {
    if (color !== 0 && readPainted()[index] === 0) commitPaint(index, color)
  }
}

describe('GamePage free painting', () => {
  it('opens any artwork without unlocking and records it as artwork progress', async () => {
    // 该素材对应的关卡仍在锁定中，自由涂色不受解锁顺序限制
    const { wrapper, stub } = await mountPaint(presetArtworks[1].id)
    try {
      expect(wrapper.find('.game-page').exists()).toBe(true)
      expect(wrapper.get('.game-title').text()).toBe(presetArtworks[1].title)
      const progress = await session()
      expect(progress.currentLevelId.value).toBe(presetArtworks[1].id)
      expect(progress.currentProgress.value?.source).toBe('artwork')
      expect(wrapper.findComponent(stub).props('level').id).toBe(presetArtworks[1].id)
    } finally {
      wrapper.unmount()
    }
  })

  it('redirects an unknown artwork back to the materials page', async () => {
    const { wrapper, router } = await mountPaint('art-404')
    try {
      expect(router.currentRoute.value.name).toBe('materials')
      expect(wrapper.find('.game-page').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps artwork writes out of the level records and unlocks', async () => {
    const { wrapper, stub } = await mountPaint(artwork.id)
    try {
      const canvas = wrapper.findComponent(stub)
      const commitPaint = canvas.props('commitPaint') as (index: number, colorId: number) => string
      const index = artwork.cells.findIndex((color) => color !== 0)
      expect(commitPaint(index, artwork.cells[index])).toBe('painted')

      const { loadProgress, getLevelSummary, isLevelUnlocked } = await import('../services/progressService')
      const records = loadProgress()
      expect(records[artwork.id]?.source).toBe('artwork')
      expect(records[artwork.id]?.painted[index]).toBe(artwork.cells[index])
      expect(records[levels[0].id]).toBeUndefined()
      expect(getLevelSummary(records)).toEqual({ total: levels.length, completed: 0 })
      expect(isLevelUnlocked(levels, records, levels[1].id)).toBe(false)

      // 回到关卡模式，同一幅图的关卡进度仍然是空白
      const progress = await session()
      expect(progress.openLevel(levels[0].id)).toBe(true)
      expect(progress.currentProgress.value?.painted.every((color) => color === 0)).toBe(true)
      expect(progress.currentProgress.value?.source).toBe('level')
    } finally {
      wrapper.unmount()
    }
  })

  it('lets the player turn the timer off and back on without losing the baseline', async () => {
    const { wrapper } = await mountPaint(artwork.id)
    try {
      vi.advanceTimersByTime(3000)
      await flushPromises()
      expect(wrapper.get('.game-timer').text()).toBe('00:03')
      const toggle = button(wrapper, '计时开')
      expect(toggle.attributes('aria-pressed')).toBe('true')

      await toggle.trigger('click')
      expect(button(wrapper, '计时关').attributes('aria-pressed')).toBe('false')
      expect(wrapper.find('.game-timer').exists()).toBe(false)
      vi.advanceTimersByTime(5000)
      const progress = await session()
      expect(progress.currentProgress.value?.elapsedSeconds).toBe(3)

      await button(wrapper, '计时关').trigger('click')
      expect(wrapper.get('.game-timer').text()).toBe('00:03')
      vi.advanceTimersByTime(2000)
      await flushPromises()
      expect(wrapper.get('.game-timer').text()).toBe('00:05')
      expect(progress.currentProgress.value?.elapsedSeconds).toBe(5)
    } finally {
      wrapper.unmount()
    }
  })

  it('settles with the artwork title and returns to the materials page', async () => {
    const { wrapper, stub, router } = await mountPaint(artwork.id)
    try {
      const canvas = wrapper.findComponent(stub)
      paintAllTargets(canvas)
      canvas.vm.$emit('completed')
      await flushPromises()

      const dialog = wrapper.get('[role="dialog"]')
      expect(dialog.get('h2').text()).toBe('作品完成！')
      expect(dialog.text()).not.toContain('下一关')
      await button(wrapper, '返回素材库').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('materials')
    } finally {
      wrapper.unmount()
    }
  })

  it('leaves level mode without the timer toggle and with the level dialog title', async () => {
    const { createAppRouter } = await import('../router')
    const { default: GamePage } = await import('./GamePage.vue')
    const router = createAppRouter(createMemoryHistory())
    await router.push(`/game/${levels[0].id}`)
    await router.isReady()
    const stub = createCanvasStub()
    const wrapper = mount(GamePage, {
      global: { plugins: [router], stubs: { PixelCanvas: stub } },
    })
    await flushPromises()
    try {
      expect(wrapper.text()).not.toContain('计时开')
      const canvas = wrapper.findComponent(stub)
      paintAllTargets(canvas)
      canvas.vm.$emit('completed')
      await flushPromises()
      expect(wrapper.get('[role="dialog"] h2').text()).toBe('关卡完成！')
      expect(wrapper.text()).toContain('下一关')
      expect(wrapper.text()).toContain('返回列表')
    } finally {
      wrapper.unmount()
    }
  })
})

function userArtwork(id: string): PixelArtwork {
  return {
    id,
    title: '我的作品',
    tags: ['原创'],
    width: 2,
    height: 2,
    palette: [{ id: 1, hex: '#F4A261', name: '色 1' }],
    cells: [1, 1, 1, 0],
  }
}

describe('GamePage user artwork painting', () => {
  it('opens a saved user artwork and records it as user progress', async () => {
    const { saveUserArtwork } = await import('../services/artworkStorage')
    const art = userArtwork('user-made-1')
    await saveUserArtwork(art, new Blob(['x'], { type: 'image/png' }))

    const { wrapper, router } = await mountPaint(art.id)
    try {
      expect(wrapper.find('.game-page').exists()).toBe(true)
      expect(wrapper.get('.game-title').text()).toBe('我的作品')
      const progress = await session()
      expect(progress.currentProgress.value?.source).toBe('user')

      const { loadProgress } = await import('../services/progressService')
      expect(loadProgress()[art.id]?.source).toBe('user')

      await button(wrapper, '返回').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('studio')
    } finally {
      wrapper.unmount()
    }
  })

  it('resolves a user artwork that is not yet in the registry', async () => {
    const { saveUserArtwork } = await import('../services/artworkStorage')
    const { unregisterUserArtwork, getArtworkById } = await import('../services/artworkService')
    const art = userArtwork('user-cold-1')
    await saveUserArtwork(art, new Blob(['x'], { type: 'image/png' }))
    // 模拟注册表未暖：涂色页应自己按需取作品，而不是直接判失败
    unregisterUserArtwork(art.id)
    expect(getArtworkById(art.id)).toBeUndefined()

    const { wrapper } = await mountPaint(art.id)
    try {
      expect(wrapper.find('.game-page').exists()).toBe(true)
      expect(wrapper.get('.game-title').text()).toBe('我的作品')
      const progress = await session()
      expect(progress.currentProgress.value?.source).toBe('user')
    } finally {
      wrapper.unmount()
    }
  })

  it('settles a user artwork with the studio back label', async () => {
    const { saveUserArtwork } = await import('../services/artworkStorage')
    const art = userArtwork('user-done-1')
    await saveUserArtwork(art, new Blob(['x'], { type: 'image/png' }))

    const { wrapper, stub, router } = await mountPaint(art.id)
    try {
      const canvas = wrapper.findComponent(stub)
      paintAllTargets(canvas)
      canvas.vm.$emit('completed')
      await flushPromises()

      const dialog = wrapper.get('[role="dialog"]')
      expect(dialog.get('h2').text()).toBe('作品完成！')
      await button(wrapper, '返回制作页').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('studio')
    } finally {
      wrapper.unmount()
    }
  })
})

describe('GamePage back navigation follows the origin page', () => {
  it('returns to materials when a published user artwork is opened from the materials library', async () => {
    const { saveUserArtwork } = await import('../services/artworkStorage')
    const { publishArtwork } = await import('../services/materialPublish')
    const art = userArtwork('user-from-materials')
    await saveUserArtwork(art, new Blob(['x'], { type: 'image/png' }))
    publishArtwork(art.id)

    // 作品类型是「用户作品」，但来源是素材库，返回应回素材库而不是制作页
    const { wrapper, router } = await mountPaintFrom('/', art.id)
    try {
      expect(wrapper.get('.game-title').text()).toBe('我的作品')
      await button(wrapper, '返回').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('materials')
    } finally {
      wrapper.unmount()
    }
  })

  it('returns to studio when a user artwork is opened from the studio page', async () => {
    const { saveUserArtwork } = await import('../services/artworkStorage')
    const art = userArtwork('user-from-studio')
    await saveUserArtwork(art, new Blob(['x'], { type: 'image/png' }))

    const { wrapper, router } = await mountPaintFrom('/studio', art.id)
    try {
      await button(wrapper, '返回').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('studio')
    } finally {
      wrapper.unmount()
    }
  })

  it('returns to the same collection detail when opened from a collection', async () => {
    const { wrapper, router } = await mountPaintFrom('/collections/col-food', presetArtworks[0].id)
    try {
      await button(wrapper, '返回').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('collection-detail')
      expect(router.currentRoute.value.params.collectionId).toBe('col-food')
    } finally {
      wrapper.unmount()
    }
  })

  it('returns to profile when a user artwork is opened from the portfolio', async () => {
    const { saveUserArtwork } = await import('../services/artworkStorage')
    const art = userArtwork('user-from-profile')
    await saveUserArtwork(art, new Blob(['x'], { type: 'image/png' }))

    const { wrapper, router } = await mountPaintFrom('/profile', art.id)
    try {
      await button(wrapper, '返回').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('profile')
    } finally {
      wrapper.unmount()
    }
  })

  it('labels the completion back button after the origin page (materials)', async () => {
    const { saveUserArtwork } = await import('../services/artworkStorage')
    const { publishArtwork } = await import('../services/materialPublish')
    const art = userArtwork('user-done-materials')
    await saveUserArtwork(art, new Blob(['x'], { type: 'image/png' }))
    publishArtwork(art.id)

    const { wrapper, stub, router } = await mountPaintFrom('/', art.id)
    try {
      const canvas = wrapper.findComponent(stub)
      paintAllTargets(canvas)
      canvas.vm.$emit('completed')
      await flushPromises()
      await button(wrapper, '返回素材库').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('materials')
    } finally {
      wrapper.unmount()
    }
  })

  it('labels the completion back button after the origin page (studio)', async () => {
    const { saveUserArtwork } = await import('../services/artworkStorage')
    const art = userArtwork('user-done-studio')
    await saveUserArtwork(art, new Blob(['x'], { type: 'image/png' }))

    const { wrapper, stub, router } = await mountPaintFrom('/studio', art.id)
    try {
      const canvas = wrapper.findComponent(stub)
      paintAllTargets(canvas)
      canvas.vm.$emit('completed')
      await flushPromises()
      await button(wrapper, '返回制作页').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('studio')
    } finally {
      wrapper.unmount()
    }
  })
})