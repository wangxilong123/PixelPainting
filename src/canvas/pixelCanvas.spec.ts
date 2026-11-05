import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Level } from '../models/level'
import { createPixelCanvas, type PaintStatus } from './pixelCanvas'

const level: Level = {
  id: 'test',
  title: '测试',
  category: 'animal',
  difficulty: 1,
  width: 3,
  height: 2,
  palette: [
    { id: 1, hex: '#AABBCC', name: '蓝灰' },
    { id: 2, hex: '#FFEEDD', name: '米色' },
  ],
  cells: [0, 1, 2, 1, 0, 2],
}

function setup(initialPainted = [0, 0, 0, 0, 0, 0], commitStatus: PaintStatus = 'painted') {
  const canvas = document.createElement('canvas')
  let width = 300
  vi.spyOn(canvas, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(10, 20, width, 200),
  )
  const context = {
    setTransform: vi.fn(), translate: vi.fn(), scale: vi.fn(), fillRect: vi.fn(),
    strokeRect: vi.fn(), fillText: vi.fn(), fillStyle: '',
  }
  const fills: string[] = []
  context.fillRect.mockImplementation(() => fills.push(context.fillStyle))
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const disconnect = vi.fn()
  let resize = () => {}
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe = vi.fn()
    disconnect = disconnect
  })
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  const request = vi.fn((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  const cancel = vi.fn((id: number) => frames.delete(id))
  vi.stubGlobal('requestAnimationFrame', request)
  vi.stubGlobal('cancelAnimationFrame', cancel)
  vi.stubGlobal('devicePixelRatio', 2)
  const painted = [...initialPainted]
  const commitPaint = vi.fn((index: number, color: number) => {
    if (commitStatus === 'painted') painted[index] = color
    return commitStatus
  })
  const onPaint = vi.fn()
  const onViewportChange = vi.fn()
  const controller = createPixelCanvas({
    canvas, level, readPainted: () => painted, commitPaint, onPaint, onViewportChange,
  })
  return {
    canvas, controller, context, fills, painted, commitPaint, onPaint, onViewportChange,
    request, cancel, disconnect,
    resizeTo(newWidth: number) { width = newWidth; resize() },
    draw() {
      const scheduled = [...frames.values()]
      frames.clear()
      for (const callback of scheduled) callback(0)
    },
  }
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('pixel canvas drawing and hit testing', () => {
  it('scales the backing store without changing CSS-pixel hit testing', () => {
    const view = setup()
    view.draw()
    expect([view.canvas.width, view.canvas.height]).toEqual([600, 400])
    expect(view.context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0)
    view.controller.setSelectedColor(1)
    expect(view.controller.paintAt(36, 12)).toEqual({ status: 'painted', index: 1, colorId: 1 })
    expect(view.commitPaint).toHaveBeenCalledExactlyOnceWith(1, 1)
    view.controller.destroy()
  })

  it('draws unfilled numbers, filled palette colors, selection, hints and temporary errors', () => {
    const view = setup([0, 1, 0, 0, 0, 0])
    view.draw()
    expect(view.context.fillText.mock.calls.map(([number]) => number)).toEqual(['2', '1', '2'])
    expect(view.fills).toContain('#AABBCC')
    view.context.strokeRect.mockClear()
    view.controller.setSelectedColor(1)
    view.controller.setHint(2)
    view.draw()
    expect(view.context.strokeRect).toHaveBeenCalledTimes(6)
    expect(view.context.strokeRect).toHaveBeenCalledWith(2, 26, 20, 20)
    expect(view.context.strokeRect).toHaveBeenCalledWith(50, 2, 20, 20)
    expect(view.controller.paintAt(60, 12)).toEqual({ status: 'incorrect', index: 2, colorId: 1 })
    expect(view.commitPaint).not.toHaveBeenCalled()
    view.context.strokeRect.mockClear()
    view.draw()
    expect(view.context.strokeRect).toHaveBeenCalledTimes(7)
    vi.advanceTimersByTime(180)
    view.context.strokeRect.mockClear()
    view.draw()
    expect(view.context.strokeRect).toHaveBeenCalledTimes(6)
    view.controller.destroy()
  })

  it('ignores empty, outside and filled cells and honors a rejected commit', () => {
    const view = setup([0, 1, 0, 0, 0, 0], 'ignored')
    expect(view.controller.paintAt(60, 12).status).toBe('ignored')
    view.controller.setSelectedColor(2)
    for (const [x, y] of [[12, 12], [72, 12], [-1, 12], [36, 12]]) {
      expect(view.controller.paintAt(x, y).status).toBe('ignored')
    }
    expect(view.controller.paintAt(60, 12).status).toBe('ignored')
    expect(view.commitPaint).toHaveBeenCalledExactlyOnceWith(2, 2)
    expect(view.painted[2]).toBe(0)
    view.controller.destroy()
  })

  it('coalesces redraws and user viewport notifications and releases pending work', () => {
    const view = setup()
    view.controller.setViewport({ scale: 2, offsetX: 4, offsetY: 8 })
    view.controller.setHint(1)
    view.controller.invalidate()
    expect(view.request).toHaveBeenCalledTimes(1)
    view.draw()
    expect(view.onViewportChange).not.toHaveBeenCalled()

    view.resizeTo(150)
    view.controller.panBy(5, 2)
    view.controller.panBy(2, 1)
    expect(view.request).toHaveBeenCalledTimes(2)
    view.draw()
    expect(view.canvas.width).toBe(300)
    expect(view.onViewportChange).toHaveBeenCalledExactlyOnceWith({ scale: 2, offsetX: 11, offsetY: 11 })

    view.controller.resetViewport()
    view.controller.setSelectedColor(2)
    view.controller.paintAt(36, 12)
    expect(vi.getTimerCount()).toBe(1)
    view.controller.destroy()
    expect(view.cancel).toHaveBeenCalledTimes(1)
    expect(view.disconnect).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
