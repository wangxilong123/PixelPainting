import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Level, LevelProgress } from '../models/level'

vi.mock('../services/audioService', () => ({
  playPaintSound: vi.fn(),
  setSoundEnabled: vi.fn(),
  isSoundEnabled: () => true,
}))

// 注册表末尾追加一个 8×8 的分块关卡：四块的可交互格数是 16/8/8/16，
// 1、2 号色只出现在第 1、4 块，3 号色只出现在第 2、3 块，方便验证提示不跨块乱指
vi.mock('../data/levels', async (importOriginal) => {
  const actual = await importOriginal<{ presetLevels: readonly Level[] }>()
  const rows = ['11220033', '11220033', '22113300', '22113300',
    '00331122', '00331122', '33002211', '33002211']
  const chunked: Level = {
    id: 'level-chunked',
    title: '分块测试',
    category: 'other',
    difficulty: 3,
    width: 8,
    height: 8,
    palette: [
      { id: 1, hex: '#F4A261', name: '橘色' },
      { id: 2, hex: '#45312F', name: '深棕' },
      { id: 3, hex: '#4A9D62', name: '绿' },
    ],
    cells: rows.flatMap((row) => [...row].map((digit) => Number(digit))),
    parts: { cols: 2, rows: 2 },
    order: 99,
  }
  return { presetLevels: [...actual.presetLevels, chunked] }
})

const chunkedId = 'level-chunked'
const completedAt = '2026-11-09T08:00:00.000Z'
const partRects = [
  { index: 0, x: 0, y: 0, width: 4, height: 4 },
  { index: 1, x: 4, y: 0, width: 4, height: 4 },
  { index: 2, x: 0, y: 4, width: 4, height: 4 },
  { index: 3, x: 4, y: 4, width: 4, height: 4 },
]

function createCanvasStub() {
  const resetViewport = vi.fn()
  const centerOnCell = vi.fn()
  const component = {
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
      resetViewport: () => resetViewport(),
      centerOnCell: (index: number) => centerOnCell(index),
    },
  }
  return { component, resetViewport, centerOnCell }
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

async function seedOthersCompleted() {
  const { createEmptyProgress, saveProgressSnapshot } = await import('../services/progressService')
  const { getLevels } = await import('../services/levelService')
  const records: Record<string, LevelProgress> = {}
  for (const level of getLevels()) {
    if (level.id === chunkedId) continue
    records[level.id] = {
      ...createEmptyProgress(level),
      painted: [...level.cells],
      startedAt: completedAt,
      completedAt,
      elapsedSeconds: 42,
      bestResult: { completedAt, elapsedSeconds: 42, hintsUsed: 0 },
    }
  }
  saveProgressSnapshot({ currentLevelId: null, levels: records })
}

async function mountGame(partIndex?: number) {
  await seedOthersCompleted()
  if (partIndex !== undefined) {
    const { loadProgressSnapshot, saveProgressSnapshot } = await import('../services/progressService')
    const snapshot = loadProgressSnapshot()
    saveProgressSnapshot({
      currentLevelId: chunkedId,
      levels: {
        ...snapshot.levels,
        [chunkedId]: {
          levelId: chunkedId,
          painted: Array(64).fill(0),
          elapsedSeconds: 0,
          hintsUsed: 0,
          startedAt: completedAt,
          partIndex,
        },
      },
    })
  }

  const { createAppRouter } = await import('../router')
  const { default: GamePage } = await import('./GamePage.vue')
  const router = createAppRouter(createMemoryHistory())
  await router.push(`/game/${chunkedId}`)
  await router.isReady()
  const stub = createCanvasStub()
  const wrapper = mount(GamePage, {
    global: { plugins: [router], stubs: { PixelCanvas: stub.component } },
  })
  await flushPromises()
  return { wrapper, stub: stub.component, centerOnCell: stub.centerOnCell,
    resetViewport: stub.resetViewport }
}

async function session() {
  const { useLevelProgress } = await import('../composables/useLevelProgress')
  return useLevelProgress()
}

function button(wrapper: VueWrapper<any>, text: string) {
  const found = wrapper.findAll('button').find((node) => node.text().includes(text))
  if (!found) throw new Error(`未找到按钮：${text}`)
  return found
}

function paintAllTargets(canvas: VueWrapper<any>): void {
  const level = canvas.props('level') as Level
  const readPainted = canvas.props('readPainted') as () => readonly number[]
  const commitPaint = canvas.props('commitPaint') as (index: number, colorId: number) => string
  for (const [index, color] of level.cells.entries()) {
    if (color !== 0 && readPainted()[index] === 0) commitPaint(index, color)
  }
}

describe('GamePage chunked painting', () => {
  it('shows the part bar with whole-level counts and hands the viewed part to the canvas', async () => {
    const { wrapper, stub } = await mountGame()
    try {
      expect(wrapper.findAll('.part-count').map((node) => node.text()))
        .toEqual(['0/16', '0/8', '0/8', '0/16'])
      expect(wrapper.find('.game-stat').text()).toContain('已填 0 / 48')
      expect(wrapper.findComponent(stub).props('part')).toEqual(partRects[0])
      expect(wrapper.findAll('.part-cell')[0].classes()).toContain('current')
    } finally {
      wrapper.unmount()
    }
  })

  it('switches the viewed part and keeps it across a reload', async () => {
    const { wrapper, stub } = await mountGame()
    try {
      await wrapper.findAll('.part-cell')[3].trigger('click')
      await flushPromises()
      expect(wrapper.findComponent(stub).props('part')).toEqual(partRects[3])
      expect(wrapper.findAll('.part-cell')[3].classes()).toContain('current')
      const progress = await session()
      expect(progress.currentProgress.value?.partIndex).toBe(3)
    } finally {
      wrapper.unmount()
    }

    const reloaded = await mountGame()
    try {
      expect(reloaded.wrapper.findComponent(reloaded.stub).props('part')).toEqual(partRects[3])
      expect(reloaded.wrapper.findAll('.part-cell')[3].classes()).toContain('current')
    } finally {
      reloaded.wrapper.unmount()
    }
  })

  it('restores the saved part when entering the level again', async () => {
    const { wrapper, stub } = await mountGame(2)
    try {
      expect(wrapper.findComponent(stub).props('part')).toEqual(partRects[2])
      expect(wrapper.findAll('.part-cell')[2].attributes('aria-current')).toBe('true')
    } finally {
      wrapper.unmount()
    }
  })

  it('hints inside the viewed part and centers the cell without switching', async () => {
    const { wrapper, stub, centerOnCell } = await mountGame()
    try {
      await button(wrapper, '提示').trigger('click')
      await flushPromises()

      const progress = await session()
      expect(progress.currentProgress.value?.partIndex ?? 0).toBe(0)
      expect(progress.currentProgress.value?.hintsUsed).toBe(1)
      expect(wrapper.findComponent(stub).props('hintIndex')).toBe(0)
      expect(centerOnCell).toHaveBeenCalledExactlyOnceWith(0)
    } finally {
      wrapper.unmount()
    }
  })

  it('moves to the part that holds the selected color instead of hinting an invisible cell', async () => {
    const { wrapper, stub, centerOnCell } = await mountGame()
    try {
      // 3 号色只存在于第 2、3 块，当前第 1 块里没有
      await wrapper.findAll('.color-swatch')[2].trigger('click')
      await flushPromises()
      await button(wrapper, '提示').trigger('click')
      await flushPromises()

      const progress = await session()
      expect(progress.currentProgress.value?.partIndex).toBe(1)
      expect(progress.currentProgress.value?.hintsUsed).toBe(1)
      expect(wrapper.findComponent(stub).props('part')).toEqual(partRects[1])
      expect(wrapper.findComponent(stub).props('hintIndex')).toBe(6)
      expect(centerOnCell).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
    }
  })

  it('drops the hint of the previous part when switching by hand', async () => {
    const { wrapper, stub } = await mountGame()
    try {
      await button(wrapper, '提示').trigger('click')
      await flushPromises()
      expect(wrapper.findComponent(stub).props('hintIndex')).toBe(0)

      await wrapper.findAll('.part-cell')[1].trigger('click')
      await flushPromises()
      expect(wrapper.findComponent(stub).props('hintIndex')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })

  it('returns to the first part on restart and still settles on the whole image', async () => {
    const { wrapper, stub } = await mountGame(3)
    try {
      const canvas = wrapper.findComponent(stub)
      paintAllTargets(canvas)
      canvas.vm.$emit('progress', { paintedCount: 48, total: 48 })
      canvas.vm.$emit('completed')
      await flushPromises()

      expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
      expect(wrapper.findAll('.part-count').map((node) => node.text()))
        .toEqual(['16/16', '8/8', '8/8', '16/16'])
      expect(wrapper.find('.game-stat').text()).toContain('已填 48 / 48')
      expect(wrapper.find('.game-progress').attributes('aria-valuenow')).toBe('48')

      await button(wrapper, '重新开始').trigger('click')
      await button(wrapper, '确认重新开始').trigger('click')
      await flushPromises()

      const progress = await session()
      expect(progress.currentProgress.value?.partIndex).toBeUndefined()
      expect(wrapper.findComponent(stub).props('part')).toEqual(partRects[0])
      expect(wrapper.findComponent(stub).props('hintIndex')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })
})
