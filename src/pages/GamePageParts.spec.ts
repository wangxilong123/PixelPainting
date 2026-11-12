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
// 1、2 号色只出现在第 1、4 块，3 号色只出现在第 2、3 块，方便验证调色板和提示都按块隔离
vi.mock('../data/levels', async (importOriginal) => {
  const actual = await importOriginal<{ presetLevels: readonly Level[] }>()
  const rows = ['11220033', '11220033', '22113300', '22113300',
    '00331122', '00331122', '33002211', '33002211']
  const chunked: Level = {
    id: 'level-chunked',
    title: '分块测试',
    tags: [],
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
      overview: { type: Object, default: null },
      autoFit: { type: Boolean, default: false },
      animate: { type: Boolean, default: false },
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

async function chunkedLevel(): Promise<Level> {
  const { presetLevels } = await import('../data/levels')
  const level = presetLevels.find((entry) => entry.id === chunkedId)
  if (!level) throw new Error('缺少分块测试关卡')
  return level
}

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
  saveProgressSnapshot({ currentId: null, records })
}

type Seed = { painted?: number[]; partIndex?: number }

async function mountGame(seed?: Seed) {
  await seedOthersCompleted()
  if (seed) {
    const { loadProgressSnapshot, saveProgressSnapshot } = await import('../services/progressService')
    const snapshot = loadProgressSnapshot()
    saveProgressSnapshot({
      currentId: chunkedId,
      records: {
        ...snapshot.records,
        [chunkedId]: {
          levelId: chunkedId,
          painted: seed.painted ?? Array(64).fill(0),
          elapsedSeconds: 0,
          hintsUsed: 0,
          startedAt: completedAt,
          partIndex: seed.partIndex,
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

// 只涂某一块里的目标格，模拟玩家在这块里涂满
function paintPart(canvas: VueWrapper<any>, partIndex: number): void {
  const level = canvas.props('level') as Level
  const readPainted = canvas.props('readPainted') as () => readonly number[]
  const commitPaint = canvas.props('commitPaint') as (index: number, colorId: number) => string
  const rect = partRects[partIndex]
  for (let row = rect.y; row < rect.y + rect.height; row += 1) {
    for (let column = rect.x; column < rect.x + rect.width; column += 1) {
      const index = row * level.width + column
      const color = level.cells[index]
      if (color !== 0 && readPainted()[index] === 0) commitPaint(index, color)
    }
  }
}

// 与真实画布一致：涂完后报一次进度，整幅涂满再报完成
function emitProgress(canvas: VueWrapper<any>): void {
  const level = canvas.props('level') as Level
  const painted = (canvas.props('readPainted') as () => readonly number[])()
  let paintedCount = 0
  let total = 0
  for (const [index, color] of level.cells.entries()) {
    if (color === 0) continue
    total += 1
    if (painted[index] === color) paintedCount += 1
  }
  canvas.vm.$emit('progress', { paintedCount, total })
  if (paintedCount === total) canvas.vm.$emit('completed')
}

function swatch(wrapper: VueWrapper<any>, colorId: number) {
  return wrapper.find(`.color-swatch[aria-label="颜色 ${colorId}"]`)
}

describe('GamePage chunked painting', () => {
  it('opens on the whole-image overview instead of a single part', async () => {
    const { wrapper, stub } = await mountGame()
    try {
      expect(wrapper.find('.part-overview').exists()).toBe(true)
      expect(wrapper.find('.part-overview-status').text()).toBe('已完成 0 / 4 块 · 下一块：第 1 块')
      expect(button(wrapper, '开始涂色').exists()).toBe(true)
      expect(wrapper.find('.part-picker').exists()).toBe(false)
      expect(wrapper.find('.color-palette').exists()).toBe(false)
      expect(wrapper.find('.game-controls').exists()).toBe(false)
      expect(wrapper.find('.game-stat').text()).toContain('已填 0 / 48')

      const canvas = wrapper.findComponent(stub)
      expect(canvas.props('part')).toBeNull()
      expect(canvas.props('overview')).toEqual({
        parts: partRects, done: [false, false, false, false], next: 0,
      })
      expect(canvas.props('animate')).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('starts painting at the first part with a palette scoped to that part', async () => {
    const { wrapper, stub } = await mountGame()
    try {
      await button(wrapper, '开始涂色').trigger('click')
      await flushPromises()

      expect(wrapper.find('.part-overview').exists()).toBe(false)
      expect(wrapper.find('.game-controls').exists()).toBe(true)
      const canvas = wrapper.findComponent(stub)
      expect(canvas.props('part')).toEqual(partRects[0])
      expect(canvas.props('overview')).toBeNull()
      const progress = await session()
      expect(progress.currentProgress.value?.partIndex).toBe(0)

      // 第 1 块只有 1、2 号色各 8 格；3 号色这块没有，直接不显示
      expect(wrapper.findAll('.color-swatch')).toHaveLength(2)
      expect(swatch(wrapper, 1).find('.swatch-count').text()).toBe('8')
      expect(swatch(wrapper, 2).find('.swatch-count').text()).toBe('8')
      expect(swatch(wrapper, 3).exists()).toBe(false)
      expect(swatch(wrapper, 1).attributes('aria-pressed')).toBe('true')
    } finally {
      wrapper.unmount()
    }
  })

  it('removes a swatch as soon as its color is painted out in the current part', async () => {
    const { wrapper, stub } = await mountGame()
    try {
      await button(wrapper, '开始涂色').trigger('click')
      await flushPromises()
      const canvas = wrapper.findComponent(stub)
      const level = canvas.props('level') as Level
      const commitPaint = canvas.props('commitPaint') as (index: number, colorId: number) => string

      // 把第 1 块的 1 号色 8 格全部涂完：色块实时撤掉，选中色自动切到 2
      const rect = partRects[0]
      for (let row = rect.y; row < rect.y + rect.height; row += 1) {
        for (let column = rect.x; column < rect.x + rect.width; column += 1) {
          const index = row * level.width + column
          if (level.cells[index] === 1) commitPaint(index, 1)
        }
      }
      await flushPromises()

      expect(wrapper.findAll('.color-swatch')).toHaveLength(1)
      expect(swatch(wrapper, 1).exists()).toBe(false)
      expect(swatch(wrapper, 2).find('.swatch-count').text()).toBe('8')
      expect(swatch(wrapper, 2).attributes('aria-pressed')).toBe('true')
    } finally {
      wrapper.unmount()
    }
  })

  it('returns to the preview after finishing a part and advances with the next button', async () => {
    const { wrapper, stub } = await mountGame()
    try {
      await button(wrapper, '开始涂色').trigger('click')
      await flushPromises()
      const canvas = wrapper.findComponent(stub)
      paintPart(canvas, 0)
      emitProgress(canvas)
      await flushPromises()

      expect(wrapper.find('.part-overview').exists()).toBe(true)
      expect(wrapper.find('.part-overview-status').text()).toBe('已完成 1 / 4 块 · 下一块：第 2 块')
      expect(button(wrapper, '下一块').exists()).toBe(true)
      expect(wrapper.find('.color-palette').exists()).toBe(false)
      expect(wrapper.find('.game-stat').text()).toContain('已填 16 / 48')
      expect(canvas.props('part')).toBeNull()
      expect(canvas.props('overview')).toEqual({
        parts: partRects, done: [true, false, false, false], next: 1,
      })
      const { playPaintSound } = await import('../services/audioService')
      expect(playPaintSound).toHaveBeenCalledWith('complete')

      await button(wrapper, '下一块').trigger('click')
      await flushPromises()
      expect(wrapper.find('.part-overview').exists()).toBe(false)
      expect(canvas.props('part')).toEqual(partRects[1])
      expect(canvas.props('overview')).toBeNull()
      const progress = await session()
      expect(progress.currentProgress.value?.partIndex).toBe(1)

      // 第 2 块只有 3 号色：1、2 号色不显示，选中色自动切到 3
      expect(wrapper.findAll('.color-swatch')).toHaveLength(1)
      expect(swatch(wrapper, 1).exists()).toBe(false)
      expect(swatch(wrapper, 2).exists()).toBe(false)
      expect(swatch(wrapper, 3).find('.swatch-count').text()).toBe('8')
      expect(swatch(wrapper, 3).attributes('aria-pressed')).toBe('true')
    } finally {
      wrapper.unmount()
    }
  })

  it('continues at the first unfinished part regardless of the saved part index', async () => {
    const level = await chunkedLevel()
    const painted = Array(64).fill(0)
    const rect = partRects[0]
    for (let row = rect.y; row < rect.y + rect.height; row += 1) {
      for (let column = rect.x; column < rect.x + rect.width; column += 1) {
        const index = row * level.width + column
        painted[index] = level.cells[index]
      }
    }
    painted[6] = 3
    const { wrapper, stub } = await mountGame({ painted, partIndex: 3 })
    try {
      expect(wrapper.find('.part-overview-status').text()).toBe('已完成 1 / 4 块 · 下一块：第 2 块')
      expect(button(wrapper, '继续涂色').exists()).toBe(true)
      expect(wrapper.find('.game-stat').text()).toContain('已填 17 / 48')
      expect(wrapper.findComponent(stub).props('overview')).toEqual({
        parts: partRects, done: [true, false, false, false], next: 1,
      })

      await button(wrapper, '继续涂色').trigger('click')
      await flushPromises()
      expect(wrapper.findComponent(stub).props('part')).toEqual(partRects[1])
      const progress = await session()
      expect(progress.currentProgress.value?.partIndex).toBe(1)
      expect(swatch(wrapper, 3).find('.swatch-count').text()).toBe('7')
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps hints inside the current part instead of jumping to another one', async () => {
    const { wrapper, stub, centerOnCell } = await mountGame()
    try {
      await button(wrapper, '开始涂色').trigger('click')
      await flushPromises()
      await button(wrapper, '提示').trigger('click')
      await flushPromises()

      const progress = await session()
      expect(progress.currentProgress.value?.partIndex).toBe(0)
      expect(progress.currentProgress.value?.hintsUsed).toBe(1)
      expect(wrapper.findComponent(stub).props('hintIndex')).toBe(0)
      expect(centerOnCell).toHaveBeenCalledExactlyOnceWith(0)

      // 3 号色只存在于第 2、3 块：当前块里找不到就返回 undefined，不跨块
      expect(progress.recordHint(3)).toBeUndefined()
      expect(progress.currentProgress.value?.hintsUsed).toBe(1)
      expect(progress.currentProgress.value?.partIndex).toBe(0)
    } finally {
      wrapper.unmount()
    }
  })

  it('shows the completion dialog over the preview and replays from the overview', async () => {
    const level = await chunkedLevel()
    const painted = [...level.cells]
    const rect = partRects[3]
    for (let row = rect.y; row < rect.y + rect.height; row += 1) {
      for (let column = rect.x; column < rect.x + rect.width; column += 1) {
        painted[row * level.width + column] = 0
      }
    }
    const { wrapper, stub } = await mountGame({ painted })
    try {
      expect(wrapper.find('.part-overview-status').text()).toBe('已完成 3 / 4 块 · 下一块：第 4 块')
      await button(wrapper, '继续涂色').trigger('click')
      await flushPromises()
      const canvas = wrapper.findComponent(stub)
      expect(canvas.props('part')).toEqual(partRects[3])

      paintPart(canvas, 3)
      emitProgress(canvas)
      await flushPromises()

      expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
      expect(wrapper.find('.part-overview').exists()).toBe(true)
      expect(wrapper.find('.part-overview-status').text()).toBe('全部 4 块已完成')
      expect(button(wrapper, '再玩一次').exists()).toBe(true)
      expect(canvas.props('overview')).toEqual({
        parts: partRects, done: [true, true, true, true], next: null,
      })
      const { playPaintSound } = await import('../services/audioService')
      expect(vi.mocked(playPaintSound).mock.calls.filter(([kind]) => kind === 'complete')).toHaveLength(1)

      await button(wrapper, '再玩一次').trigger('click')
      await button(wrapper, '确认重新开始').trigger('click')
      await flushPromises()

      expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
      expect(wrapper.find('.part-overview-status').text()).toBe('已完成 0 / 4 块 · 下一块：第 1 块')
      expect(button(wrapper, '开始涂色').exists()).toBe(true)
      const progress = await session()
      expect(progress.currentProgress.value?.partIndex).toBeUndefined()
      expect(progress.currentProgress.value?.painted).toEqual(Array(64).fill(0))
      expect(canvas.props('part')).toBeNull()
      expect(canvas.props('overview')).toEqual({
        parts: partRects, done: [false, false, false, false], next: 0,
      })
    } finally {
      wrapper.unmount()
    }
  })

  it('returns to the overview when restarting mid-part', async () => {
    const { wrapper, stub } = await mountGame()
    try {
      await button(wrapper, '开始涂色').trigger('click')
      await flushPromises()
      const canvas = wrapper.findComponent(stub)
      const commitPaint = canvas.props('commitPaint') as (index: number, colorId: number) => string
      commitPaint(0, 1)
      emitProgress(canvas)
      await flushPromises()
      expect(wrapper.find('.game-stat').text()).toContain('已填 1 / 48')

      await button(wrapper, '重新开始').trigger('click')
      await button(wrapper, '确认重新开始').trigger('click')
      await flushPromises()

      expect(wrapper.find('.part-overview').exists()).toBe(true)
      expect(button(wrapper, '开始涂色').exists()).toBe(true)
      expect(wrapper.find('.game-stat').text()).toContain('已填 0 / 48')
      expect(canvas.props('part')).toBeNull()
      expect(canvas.props('overview')).toEqual({
        parts: partRects, done: [false, false, false, false], next: 0,
      })
      expect(canvas.props('hintIndex')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })
})