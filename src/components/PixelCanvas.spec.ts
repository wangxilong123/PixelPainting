import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLevels } from '../services/levelService'
import PixelCanvas from './PixelCanvas.vue'

const [first, second] = getLevels()
const remaining = first.cells.flatMap((color, index) => color === 1 ? [index] : []).slice(0, 2)

function click(canvas: HTMLCanvasElement, index: number): void {
  const clientX = (index % first.width) * 24 + 12
  const clientY = Math.floor(index / first.width) * 24 + 12
  for (const type of ['pointerdown', 'pointerup']) {
    canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', clientX, clientY }))
  }
}

let flushFrame: () => void
let fillText: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
  fillText = vi.fn()
  const context = {
    setTransform: vi.fn(), translate: vi.fn(), scale: vi.fn(),
    fillRect: vi.fn(), strokeRect: vi.fn(), fillText,
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 0, 320, 300))

  const frames = new Map<number, FrameRequestCallback>()
  let nextId = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextId, callback)
    return nextId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  flushFrame = () => {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(0)
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PixelCanvas', () => {
  it('uses real progress writes and emits progress and completion exactly when a paint succeeds', async () => {
    const { createEmptyProgress, saveProgressSnapshot } = await import('../services/progressService')
    const { useLevelProgress } = await import('../composables/useLevelProgress')
    saveProgressSnapshot({
      currentId: first.id,
      records: {
        [first.id]: {
          ...createEmptyProgress(first),
          painted: first.cells.map((color, index) => remaining.includes(index) ? 0 : color),
        },
      },
    })
    const progress = useLevelProgress()
    progress.openLevel(first.id)
    const props = {
      level: first,
      readPainted: () => progress.currentProgress.value?.painted ?? [],
      commitPaint: progress.paintCell,
      selectedColorId: 2,
    }
    const wrapper = mount(PixelCanvas, { props })
    try {
      const canvas = wrapper.get('canvas').element
      click(canvas, remaining[0])
      expect(wrapper.emitted('paint')).toEqual([[{ status: 'incorrect', index: remaining[0], colorId: 2 }]])
      expect(wrapper.emitted('progress')).toBeUndefined()
      await wrapper.setProps({ selectedColorId: 1 })
      click(canvas, remaining[0])
      click(canvas, remaining[1])
      click(canvas, remaining[1])
      expect(wrapper.emitted('progress')).toEqual([
        [{ paintedCount: 37, total: 38 }],
        [{ paintedCount: 38, total: 38 }],
      ])
      expect(wrapper.emitted('completed')).toEqual([[]])
      expect(progress.currentProgress.value?.completedAt).toBeTruthy()
      const restored = mount(PixelCanvas, { props })
      try {
        flushFrame()
        expect(restored.emitted('completed')).toBeUndefined()
      } finally {
        restored.unmount()
      }
      fillText.mockClear()
      progress.restartLevel()
      await nextTick()
      flushFrame()
      expect(fillText).toHaveBeenCalledTimes(38)
    } finally {
      wrapper.unmount()
    }
  })

  it('redraws after switching levels and removes event handling when unmounted', async () => {
    const wrapper = mount(PixelCanvas, {
      props: { level: first, readPainted: () => [], commitPaint: vi.fn(), selectedColorId: 1 },
    })
    const canvas = wrapper.get('canvas').element
    flushFrame()
    expect(fillText).toHaveBeenCalledTimes(38)
    fillText.mockClear()
    await wrapper.setProps({ level: second, hintIndex: 3 })
    flushFrame()
    expect(fillText).toHaveBeenCalledTimes(39)
    wrapper.unmount()
    const wheel = new WheelEvent('wheel', { deltaY: -100, cancelable: true })
    canvas.dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(false)
  })
})
