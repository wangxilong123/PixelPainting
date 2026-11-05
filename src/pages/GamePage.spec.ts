import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Level, LevelProgress } from '../models/level'
import { getLevels } from '../services/levelService'

const [first, second, third] = getLevels()
const completedAt = '2026-11-05T08:00:00.000Z'

function firstTarget(level: Level): [number, number] {
  const index = level.cells.findIndex((color) => color !== 0)
  return [index, level.cells[index]]
}

function createCanvasStub() {
  const resetViewport = vi.fn()
  const component = {
    name: 'PixelCanvas',
    props: {
      level: { type: Object, required: true },
      readPainted: { type: Function, required: true },
      commitPaint: { type: Function, required: true },
      selectedColorId: { type: Number, default: null },
      viewport: { type: Object, default: undefined },
      hintIndex: { type: Number, default: null },
      autoFit: { type: Boolean, default: false },
    },
    emits: ['paint', 'progress', 'completed', 'viewport-change'],
    template: '<div class="canvas-stub" />',
    methods: {
      zoomAt: () => {},
      panBy: () => {},
      resetViewport: () => resetViewport(),
    },
  }
  return { component, resetViewport }
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

async function mountGame(levelId: string) {
  const { createAppRouter } = await import('../router')
  const { default: GamePage } = await import('./GamePage.vue')
  const router = createAppRouter(createMemoryHistory())
  await router.push(`/game/${levelId}`)
  await router.isReady()
  const stub = createCanvasStub()
  const wrapper = mount(GamePage, {
    global: { plugins: [router], stubs: { PixelCanvas: stub.component } },
  })
  await flushPromises()
  return { wrapper, router, stub: stub.component, resetViewport: stub.resetViewport }
}

async function progressSession() {
  const { useLevelProgress } = await import('../composables/useLevelProgress')
  return useLevelProgress()
}

async function seedCompleted(ids: string[]) {
  const { createEmptyProgress, saveProgressSnapshot } = await import('../services/progressService')
  const records: Record<string, LevelProgress> = {}
  for (const id of ids) {
    const level = getLevels().find((entry) => entry.id === id)!
    records[id] = {
      ...createEmptyProgress(level),
      painted: [...level.cells],
      startedAt: completedAt,
      completedAt,
      elapsedSeconds: 42,
      stars: 3,
      bestResult: { completedAt, stars: 3, elapsedSeconds: 42, hintsUsed: 0 },
    }
  }
  saveProgressSnapshot({ currentLevelId: null, levels: records })
}

function button(wrapper: VueWrapper<any>, text: string) {
  const found = wrapper.findAll('button').find((node) => node.text().includes(text))
  if (!found) throw new Error(`未找到按钮：${text}`)
  return found
}

function hasButton(wrapper: VueWrapper<any>, text: string): boolean {
  return wrapper.findAll('button').some((node) => node.text().includes(text))
}

function paintAllTargets(canvas: VueWrapper<any>): void {
  const level = canvas.props('level') as Level
  const readPainted = canvas.props('readPainted') as () => readonly number[]
  const commitPaint = canvas.props('commitPaint') as (index: number, colorId: number) => string
  for (const [index, color] of level.cells.entries()) {
    if (color !== 0 && readPainted()[index] === 0) commitPaint(index, color)
  }
}

function paintColor(canvas: VueWrapper<any>, colorId: number): void {
  const level = canvas.props('level') as Level
  const readPainted = canvas.props('readPainted') as () => readonly number[]
  const commitPaint = canvas.props('commitPaint') as (index: number, colorId: number) => string
  for (const [index, target] of level.cells.entries()) {
    if (target === colorId && readPainted()[index] === 0) commitPaint(index, colorId)
  }
}

describe('GamePage', () => {
  it('redirects unknown or locked levels and enters an unlocked one', async () => {
    const unknown = await mountGame('level-404')
    expect(unknown.router.currentRoute.value.name).toBe('levels')
    expect(unknown.wrapper.find('.game-page').exists()).toBe(false)
    unknown.wrapper.unmount()

    const locked = await mountGame(second.id)
    expect(locked.router.currentRoute.value.name).toBe('levels')
    locked.wrapper.unmount()

    const played = await mountGame(first.id)
    expect(played.router.currentRoute.value.path).toBe(`/game/${first.id}`)
    expect(played.wrapper.find('.game-page').exists()).toBe(true)
    expect(played.wrapper.text()).toContain('橘猫')
    const session = await progressSession()
    expect(session.currentLevelId.value).toBe(first.id)
    played.wrapper.unmount()
  })

  it('restores painted cells, hints, viewport and the elapsed baseline after reload', async () => {
    const { createEmptyProgress, saveProgressSnapshot } = await import('../services/progressService')
    const painted = first.cells.map(() => 0)
    const [index, color] = firstTarget(first)
    painted[index] = color
    saveProgressSnapshot({
      currentLevelId: first.id,
      levels: {
        [first.id]: {
          ...createEmptyProgress(first),
          painted,
          startedAt: completedAt,
          elapsedSeconds: 30,
          hintsUsed: 1,
          viewport: { scale: 2, offsetX: -18, offsetY: 12 },
        },
      },
    })

    const { wrapper, stub } = await mountGame(first.id)
    try {
      const canvas = wrapper.findComponent(stub)
      expect(canvas.props('viewport')).toEqual({ scale: 2, offsetX: -18, offsetY: 12 })
      const restored = canvas.props('readPainted') as () => readonly number[]
      expect(restored()[index]).toBe(color)
      expect(wrapper.find('.game-timer').text()).toBe('00:30')
      expect(wrapper.text()).toContain('已填 1 / 38')

      vi.advanceTimersByTime(1000)
      const session = await progressSession()
      expect(session.currentProgress.value?.elapsedSeconds).toBe(31)
      expect(session.currentProgress.value?.hintsUsed).toBe(1)
      expect(wrapper.find('.game-timer').text()).toBe('00:31')
    } finally {
      wrapper.unmount()
    }
  })

  it('passes the selected color from the palette to the canvas', async () => {
    const { wrapper, stub } = await mountGame(first.id)
    try {
      const canvas = wrapper.findComponent(stub)
      expect(canvas.props('autoFit')).toBe(true)
      expect(canvas.props('selectedColorId')).toBe(first.palette[0].id)
      await wrapper.findAll('.color-swatch')[1].trigger('click')
      expect(canvas.props('selectedColorId')).toBe(first.palette[1].id)
    } finally {
      wrapper.unmount()
    }
  })

  it('auto-advances the selected color in palette order once a color is exhausted', async () => {
    const { wrapper, stub } = await mountGame(first.id)
    try {
      const canvas = wrapper.findComponent(stub)
      expect(canvas.props('selectedColorId')).toBe(1)
      paintColor(canvas, 1)
      await flushPromises()
      expect(canvas.props('selectedColorId')).toBe(2)

      await wrapper.findAll('.color-swatch')[2].trigger('click')
      expect(canvas.props('selectedColorId')).toBe(3)
      paintColor(canvas, 2)
      await flushPromises()
      expect(canvas.props('selectedColorId')).toBe(3)

      paintColor(canvas, 3)
      await flushPromises()
      expect(canvas.props('selectedColorId')).toBe(3)
    } finally {
      wrapper.unmount()
    }
  })

  it('shows the finished artwork above the dialog actions', async () => {
    const { wrapper, stub } = await mountGame(first.id)
    try {
      const canvas = wrapper.findComponent(stub)
      paintAllTargets(canvas)
      canvas.vm.$emit('completed')
      await flushPromises()

      const dialog = wrapper.find('[role="dialog"]')
      expect(dialog.findAll('.pixel-preview .preview-cell')).toHaveLength(first.cells.length)
      expect(hasButton(wrapper, '下一关')).toBe(true)
      expect(hasButton(wrapper, '再玩一次')).toBe(true)
      expect(hasButton(wrapper, '返回列表')).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('rejects an incorrect paint and updates the counter from progress events', async () => {
    const { wrapper, stub } = await mountGame(first.id)
    try {
      const canvas = wrapper.findComponent(stub)
      const [index, color] = firstTarget(first)
      const commitPaint = canvas.props('commitPaint') as (i: number, c: number) => string
      expect(commitPaint(index, 99)).toBe('incorrect')
      const painted = canvas.props('readPainted') as () => readonly number[]
      expect(painted()[index]).toBe(0)
      const session = await progressSession()
      expect(session.currentProgress.value?.painted.filter((color) => color !== 0)).toHaveLength(0)

      canvas.vm.$emit('progress', { paintedCount: 5, total: 38 })
      await flushPromises()
      expect(wrapper.text()).toContain('已填 5 / 38')
    } finally {
      wrapper.unmount()
    }
  })

  it('records a hint and highlights the first unfilled target cell', async () => {
    const { wrapper, stub } = await mountGame(first.id)
    try {
      await button(wrapper, '提示').trigger('click')
      const canvas = wrapper.findComponent(stub)
      expect(canvas.props('hintIndex')).toBe(firstTarget(first)[0])
      const session = await progressSession()
      expect(session.currentProgress.value?.hintsUsed).toBe(1)
    } finally {
      wrapper.unmount()
    }
  })

  it('undoes and redoes painted cells and freezes both after completion', async () => {
    const { wrapper, stub } = await mountGame(first.id)
    try {
      const canvas = wrapper.findComponent(stub)
      const [index, color] = firstTarget(first)
      const commitPaint = canvas.props('commitPaint') as (i: number, c: number) => string
      const readPainted = canvas.props('readPainted') as () => readonly number[]
      commitPaint(index, color)
      canvas.vm.$emit('paint', { status: 'painted', index, colorId: color })
      await flushPromises()
      expect(readPainted()[index]).toBe(color)
      expect(button(wrapper, '撤销').attributes('disabled')).toBeUndefined()

      await button(wrapper, '撤销').trigger('click')
      expect(readPainted()[index]).toBe(0)
      expect(button(wrapper, '重做').attributes('disabled')).toBeUndefined()

      await button(wrapper, '重做').trigger('click')
      expect(readPainted()[index]).toBe(color)

      paintAllTargets(canvas)
      canvas.vm.$emit('completed')
      await flushPromises()
      expect(button(wrapper, '撤销').attributes('disabled')).toBeDefined()
      expect(button(wrapper, '重做').attributes('disabled')).toBeDefined()
    } finally {
      wrapper.unmount()
    }
  })

  it('opens the completion dialog once with the saved result and stops the timer', async () => {
    const { wrapper, stub } = await mountGame(first.id)
    try {
      const canvas = wrapper.findComponent(stub)
      vi.advanceTimersByTime(19_000)
      paintAllTargets(canvas)
      canvas.vm.$emit('completed')
      canvas.vm.$emit('completed')
      await flushPromises()

      const dialogs = wrapper.findAll('[role="dialog"]')
      expect(dialogs).toHaveLength(1)
      expect(dialogs[0].text()).toContain('★★★')
      expect(dialogs[0].text()).toContain('用时 00:19')
      expect(dialogs[0].text()).not.toContain('正确率')
      expect(dialogs[0].text()).toContain('提示 0 次')

      const session = await progressSession()
      vi.advanceTimersByTime(5000)
      expect(session.currentProgress.value?.elapsedSeconds).toBe(19)
    } finally {
      wrapper.unmount()
    }
  })

  it('advances to the next level from the dialog', async () => {
    const { wrapper, stub, router } = await mountGame(first.id)
    try {
      const canvas = wrapper.findComponent(stub)
      paintAllTargets(canvas)
      canvas.vm.$emit('completed')
      await flushPromises()
      await button(wrapper, '下一关').trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.path).toBe(`/game/${second.id}`)
      expect(wrapper.text()).toContain('红苹果')
      const session = await progressSession()
      expect(session.currentLevelId.value).toBe(second.id)
    } finally {
      wrapper.unmount()
    }
  })

  it('hides the next button when the last level is completed', async () => {
    await seedCompleted([first.id, second.id])
    const { wrapper, stub } = await mountGame(third.id)
    try {
      const canvas = wrapper.findComponent(stub)
      paintAllTargets(canvas)
      canvas.vm.$emit('completed')
      await flushPromises()
      expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
      expect(hasButton(wrapper, '下一关')).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('replays while preserving the best result and unlocks', async () => {
    const { wrapper, stub } = await mountGame(first.id)
    try {
      const canvas = wrapper.findComponent(stub)
      paintAllTargets(canvas)
      canvas.vm.$emit('completed')
      await flushPromises()
      const session = await progressSession()
      const best = session.currentProgress.value?.bestResult
      expect(best).toBeDefined()

      await button(wrapper, '再玩一次').trigger('click')
      await flushPromises()
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
      const readPainted = canvas.props('readPainted') as () => readonly number[]
      expect(readPainted().every((color) => color === 0)).toBe(true)
      expect(wrapper.find('.game-timer').text()).toBe('00:00')
      expect(session.currentProgress.value?.bestResult).toEqual(best)
      expect(session.getNextLevelId()).toBe(second.id)
      expect(button(wrapper, '撤销').attributes('disabled')).toBeDefined()
    } finally {
      wrapper.unmount()
    }
  })

  it('restarts with confirmation and clears timer, history and hint', async () => {
    const { wrapper, stub, resetViewport } = await mountGame(first.id)
    try {
      const canvas = wrapper.findComponent(stub)
      const [index, color] = firstTarget(first)
      const commitPaint = canvas.props('commitPaint') as (i: number, c: number) => string
      commitPaint(index, color)
      canvas.vm.$emit('paint', { status: 'painted', index, colorId: color })
      await button(wrapper, '提示').trigger('click')
      vi.advanceTimersByTime(5000)
      await flushPromises()

      await button(wrapper, '重新开始').trigger('click')
      await button(wrapper, '确认重新开始').trigger('click')
      await flushPromises()

      const readPainted = canvas.props('readPainted') as () => readonly number[]
      expect(readPainted()[index]).toBe(0)
      expect(canvas.props('hintIndex')).toBeNull()
      expect(wrapper.find('.game-timer').text()).toBe('00:00')
      expect(button(wrapper, '撤销').attributes('disabled')).toBeDefined()
      expect(resetViewport).toHaveBeenCalledTimes(1)

      const session = await progressSession()
      expect(session.currentProgress.value?.elapsedSeconds).toBe(0)
      vi.advanceTimersByTime(2000)
      expect(session.currentProgress.value?.elapsedSeconds).toBe(2)
    } finally {
      wrapper.unmount()
    }
  })

  it('stops the timer after unmount', async () => {
    const { wrapper } = await mountGame(first.id)
    vi.advanceTimersByTime(3000)
    const session = await progressSession()
    expect(session.currentProgress.value?.elapsedSeconds).toBe(3)
    wrapper.unmount()
    vi.advanceTimersByTime(5000)
    expect(session.currentProgress.value?.elapsedSeconds).toBe(3)
  })
})
