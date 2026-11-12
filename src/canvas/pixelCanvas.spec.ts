import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Level, LevelParts } from '../models/level'
import { getPartRects } from '../services/levelService'
import { createPixelCanvas, type PaintStatus } from './pixelCanvas'

const level: Level = {
  id: 'test',
  title: '测试',
  tags: [],
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

const chunked: Level = {
  id: 'chunked',
  title: '分块',
  tags: [],
  category: 'animal',
  difficulty: 3,
  width: 4,
  height: 4,
  palette: [
    { id: 1, hex: '#AABBCC', name: '蓝灰' },
    { id: 2, hex: '#FFEEDD', name: '米色' },
  ],
  cells: [1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 1],
  parts: { cols: 2, rows: 2 },
}

function solid(width: number, height: number, parts?: LevelParts): Level {
  return {
    id: 'solid',
    title: '大图',
    tags: [],
    category: 'animal',
    difficulty: 3,
    width,
    height,
    palette: [{ id: 1, hex: '#AABBCC', name: '蓝灰' }],
    cells: Array<number>(width * height).fill(1),
    parts,
  }
}

function setup(
  initialPainted = [0, 0, 0, 0, 0, 0],
  commitStatus: PaintStatus = 'painted',
  autoFit = false,
  boardLevel: Level = level,
) {
  const canvas = document.createElement('canvas')
  let width = 300
  vi.spyOn(canvas, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(10, 20, width, 200),
  )
  const capture = vi.fn()
  const release = vi.fn()
  canvas.setPointerCapture = capture
  canvas.releasePointerCapture = release
  const context = {
    setTransform: vi.fn(), translate: vi.fn(), scale: vi.fn(), fillRect: vi.fn(),
    strokeRect: vi.fn(), fillText: vi.fn(), fillStyle: '', font: '',
  }
  const fills: string[] = []
  const fonts: string[] = []
  context.fillRect.mockImplementation(() => fills.push(context.fillStyle))
  context.fillText.mockImplementation(() => fonts.push(context.font))
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
    canvas, level: boardLevel, readPainted: () => painted, commitPaint, onPaint, onViewportChange, autoFit,
  })
  return {
    canvas, controller, context, fills, fonts, painted, commitPaint, onPaint, onViewportChange,
    request, cancel, disconnect, capture, release,
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

function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number, options = {}) {
  canvas.dispatchEvent(new PointerEvent(type, {
    pointerId: 1, pointerType: 'mouse', clientX: x + 10, clientY: y + 20, ...options,
  }))
}

describe('pixel canvas gestures', () => {
  it('clips captured paint to the visible canvas before hitting board cells', () => {
    const view = setup()
    view.resizeTo(48)
    view.controller.setSelectedColor(1)
    pointer(view.canvas, 'pointerdown', 36, 12)
    pointer(view.canvas, 'pointermove', 70, 12)
    pointer(view.canvas, 'pointerup', 70, 12)
    expect(view.onPaint).toHaveBeenCalledExactlyOnceWith({ status: 'painted', index: 1, colorId: 1 })
    expect(view.controller.paintAt(60, 12).status).toBe('ignored')
    view.controller.destroy()
  })

  it('traverses skipped cells and deduplicates even wrong colors until the next drag', () => {
    const view = setup()
    view.controller.setSelectedColor(1)
    pointer(view.canvas, 'pointerdown', 12, 12)
    pointer(view.canvas, 'pointermove', 70, 12)
    pointer(view.canvas, 'pointermove', 12, 12)
    pointer(view.canvas, 'pointerup', 12, 12)
    expect(view.capture).toHaveBeenCalledWith(1)
    expect(view.release).toHaveBeenCalledWith(1)
    expect(view.onPaint.mock.calls.map(([result]) => [result.index, result.status]))
      .toEqual([[1, 'painted'], [2, 'incorrect']])
    pointer(view.canvas, 'pointerdown', 60, 12)
    pointer(view.canvas, 'pointerup', 60, 12)
    expect(view.onPaint).toHaveBeenCalledTimes(3)
    view.controller.destroy()
  })

  it('uses pinch distance and midpoint, then waits for both touches to end', () => {
    const view = setup()
    const first = { pointerType: 'touch', pointerId: 1 }
    const second = { pointerType: 'touch', pointerId: 2 }
    view.controller.setSelectedColor(1)
    pointer(view.canvas, 'pointerdown', 36, 12, first)
    pointer(view.canvas, 'pointerdown', 60, 12, second)
    pointer(view.canvas, 'pointermove', 84, 12, second)
    view.draw()
    expect(view.onViewportChange).toHaveBeenCalledExactlyOnceWith({ scale: 2, offsetX: -36, offsetY: -12 })
    pointer(view.canvas, 'pointerup', 84, 12, second)
    pointer(view.canvas, 'pointermove', 48, 12, first)
    pointer(view.canvas, 'pointerup', 48, 12, first)
    expect(view.commitPaint).not.toHaveBeenCalled()
    view.controller.resetViewport()
    pointer(view.canvas, 'pointerdown', 36, 12, first)
    expect(view.commitPaint).not.toHaveBeenCalled()
    pointer(view.canvas, 'pointerup', 36, 12, first)
    expect(view.commitPaint).toHaveBeenCalledExactlyOnceWith(1, 1)
    view.controller.destroy()
  })

  it.each(['pointercancel', 'lostpointercapture'])('clears pending touch on %s', (type) => {
    const view = setup()
    const touch = { pointerType: 'touch' }
    view.controller.setSelectedColor(1)
    pointer(view.canvas, 'pointerdown', 36, 12, touch)
    pointer(view.canvas, type, 36, 12, touch)
    pointer(view.canvas, 'pointerup', 36, 12, touch)
    expect(view.commitPaint).not.toHaveBeenCalled()
    pointer(view.canvas, 'pointerdown', 36, 12, touch)
    pointer(view.canvas, 'pointermove', 60, 12, touch)
    expect(view.commitPaint).toHaveBeenCalledExactlyOnceWith(1, 1)
    view.controller.destroy()
  })

  it('pans with the middle button and uses wheel zoom around a local anchor', () => {
    const view = setup()
    pointer(view.canvas, 'pointerdown', 12, 12, { button: 1 })
    pointer(view.canvas, 'pointermove', 20, 18)
    pointer(view.canvas, 'pointerup', 20, 18, { button: 1 })
    view.draw()
    expect(view.onViewportChange).toHaveBeenLastCalledWith({ scale: 1, offsetX: 8, offsetY: 6 })
    const wheel = new WheelEvent('wheel', {
      clientX: 46, clientY: 32, deltaY: -Math.log(2) / 0.0015, cancelable: true,
    })
    view.canvas.dispatchEvent(wheel)
    view.draw()
    expect(wheel.defaultPrevented).toBe(true)
    expect(view.onViewportChange).toHaveBeenLastCalledWith({ scale: 2, offsetX: -20, offsetY: 0 })
    expect(view.commitPaint).not.toHaveBeenCalled()
    view.controller.destroy()
    const detached = new WheelEvent('wheel', { deltaY: -100, cancelable: true })
    view.canvas.dispatchEvent(detached)
    expect(detached.defaultPrevented).toBe(false)
  })
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

  it('tints empty cells and draws numbers, filled colors, selection, hints and temporary errors', () => {
    const view = setup([0, 1, 0, 0, 0, 0])
    view.draw()
    expect(view.context.fillText.mock.calls.map(([number]) => number)).toEqual(['2', '1', '2'])
    expect(view.fills).toContain('#AABBCC')
    expect(view.fills).toContain('#e1e4ee')
    expect(view.fills).toContain('#f4f0f2')
    expect(view.fills).not.toContain('#f1f0f8')
    view.context.strokeRect.mockClear()
    view.controller.setSelectedColor(1)
    view.controller.setHint(2)
    view.draw()
    expect(view.context.strokeRect).toHaveBeenCalledTimes(5)
    expect(view.context.strokeRect).not.toHaveBeenCalledWith(24, 0, 24, 24)
    expect(view.context.strokeRect).toHaveBeenCalledWith(2, 26, 20, 20)
    expect(view.context.strokeRect).toHaveBeenCalledWith(50, 2, 20, 20)
    expect(view.controller.paintAt(60, 12)).toEqual({ status: 'incorrect', index: 2, colorId: 1 })
    expect(view.commitPaint).not.toHaveBeenCalled()
    view.context.strokeRect.mockClear()
    view.draw()
    expect(view.context.strokeRect).toHaveBeenCalledTimes(6)
    vi.advanceTimersByTime(180)
    view.context.strokeRect.mockClear()
    view.draw()
    expect(view.context.strokeRect).toHaveBeenCalledTimes(5)
    view.controller.destroy()
  })

  it('shrinks two-digit numbers and keeps them legible at low zoom', () => {
    const wide: Level = {
      ...level,
      palette: [
        { id: 3, hex: '#AABBCC', name: '蓝灰' },
        { id: 12, hex: '#FFEEDD', name: '米色' },
      ],
      cells: [0, 3, 12, 3, 0, 12],
    }
    const view = setup([0, 0, 0, 0, 0, 0], 'painted', false, wide)
    view.draw()
    expect(view.context.fillText.mock.calls.map(([text, , , maxWidth]) => [text, maxWidth]))
      .toEqual([['3', 20], ['12', 20], ['3', 20], ['12', 20]])
    expect(view.fonts).toEqual([
      '12px system-ui, sans-serif',
      '9px system-ui, sans-serif',
      '12px system-ui, sans-serif',
      '9px system-ui, sans-serif',
    ])

    // 缩到 0.5 时格子只有 12 屏幕像素，编号按屏幕恒定 8px 画（世界字号 16），不再隐藏
    view.context.fillText.mockClear()
    view.fonts.length = 0
    view.controller.setViewport({ scale: 0.5, offsetX: 0, offsetY: 0 })
    view.draw()
    expect(view.context.fillText.mock.calls.map(([text]) => text)).toEqual(['3', '12', '3', '12'])
    expect(view.fonts).toEqual([
      '16px system-ui, sans-serif',
      '16px system-ui, sans-serif',
      '16px system-ui, sans-serif',
      '16px system-ui, sans-serif',
    ])
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

describe('pixel canvas auto fit and right-drag pan', () => {
  it('centers the level and hit-tests through the fitted viewport without saving it', () => {
    const view = setup([0, 0, 0, 0, 0, 0], 'painted', true)
    view.draw()
    expect(view.context.translate).toHaveBeenCalledWith(78, 52)
    expect(view.context.scale).toHaveBeenCalledWith(2, 2)
    expect(view.onViewportChange).not.toHaveBeenCalled()
    view.controller.setSelectedColor(1)
    expect(view.controller.paintAt(150, 76)).toEqual({ status: 'painted', index: 1, colorId: 1 })
    expect(view.controller.paintAt(12, 12).status).toBe('ignored')
    view.controller.destroy()
  })

  it('re-fits on resize until the first pan adopts the fitted viewport', () => {
    const view = setup([0, 0, 0, 0, 0, 0], 'painted', true)
    view.resizeTo(108)
    view.draw()
    expect(view.context.translate).toHaveBeenLastCalledWith(0, 64)
    view.controller.panBy(10, 5)
    view.draw()
    expect(view.onViewportChange).toHaveBeenCalledExactlyOnceWith({ scale: 1.5, offsetX: 10, offsetY: 69 })
    view.resizeTo(300)
    view.draw()
    expect(view.context.translate).toHaveBeenLastCalledWith(10, 69)
    view.controller.destroy()
  })

  it('honors a saved viewport and returns to the fitted view on reset', () => {
    const view = setup([0, 0, 0, 0, 0, 0], 'painted', true)
    view.controller.setViewport({ scale: 2, offsetX: 4, offsetY: 8 })
    view.draw()
    expect(view.context.translate).toHaveBeenLastCalledWith(4, 8)
    expect(view.onViewportChange).not.toHaveBeenCalled()
    view.controller.resetViewport()
    view.draw()
    expect(view.onViewportChange).toHaveBeenCalledExactlyOnceWith({ scale: 1, offsetX: 0, offsetY: 0 })
    expect(view.context.translate).toHaveBeenLastCalledWith(78, 52)
    view.controller.panBy(3, 4)
    view.draw()
    expect(view.context.translate).toHaveBeenLastCalledWith(81, 56)
    view.controller.setViewport({ scale: 1, offsetX: 0, offsetY: 0 })
    view.draw()
    expect(view.context.translate).toHaveBeenLastCalledWith(78, 52)
    view.controller.destroy()
  })

  it('centers a hinted cell in the viewport and keeps hit testing aligned', () => {
    const view = setup([0, 0, 0, 0, 0, 0], 'painted', true)
    view.controller.centerOnCell(2)
    view.draw()
    expect(view.onViewportChange).toHaveBeenCalledExactlyOnceWith({ scale: 2, offsetX: 30, offsetY: 76 })
    view.controller.setSelectedColor(2)
    expect(view.controller.paintAt(150, 100)).toEqual({ status: 'painted', index: 2, colorId: 2 })
    view.controller.destroy()
  })

  it('ignores a center request for an index outside the board', () => {
    const view = setup()
    for (const index of [-1, 6, 1.5, Number.NaN]) view.controller.centerOnCell(index)
    view.draw()
    expect(view.onViewportChange).not.toHaveBeenCalled()
    view.controller.destroy()
  })

  it('pans with the right button and suppresses the context menu', () => {
    const view = setup()
    pointer(view.canvas, 'pointerdown', 12, 12, { button: 2 })
    pointer(view.canvas, 'pointermove', 30, 20)
    pointer(view.canvas, 'pointerup', 30, 20, { button: 2 })
    view.draw()
    expect(view.onViewportChange).toHaveBeenCalledExactlyOnceWith({ scale: 1, offsetX: 18, offsetY: 8 })
    expect(view.commitPaint).not.toHaveBeenCalled()
    const menu = new MouseEvent('contextmenu', { cancelable: true })
    view.canvas.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
    view.controller.destroy()
    const detached = new MouseEvent('contextmenu', { cancelable: true })
    view.canvas.dispatchEvent(detached)
    expect(detached.defaultPrevented).toBe(false)
  })
})

describe('pixel canvas parts', () => {
  it('draws only the cells of the active part and the whole level without one', () => {
    const view = setup(Array(16).fill(0), 'painted', true, chunked)
    view.draw()
    expect(view.context.fillText).toHaveBeenCalledTimes(16)
    expect(view.context.translate).toHaveBeenLastCalledWith(54, 4)

    view.context.fillText.mockClear()
    view.controller.setPart(getPartRects(chunked)[3])
    view.draw()
    expect(view.context.fillText.mock.calls.map(([text]) => text)).toEqual(['1', '2', '2', '1'])
    expect(view.context.translate).toHaveBeenLastCalledWith(6, -44)

    view.context.fillText.mockClear()
    view.controller.setPart(null)
    view.draw()
    expect(view.context.fillText).toHaveBeenCalledTimes(16)
    expect(view.context.translate).toHaveBeenLastCalledWith(54, 4)
    view.controller.destroy()
  })

  it('ignores hits outside the active part and paints inside it', () => {
    const view = setup(Array(16).fill(0), 'painted', true, chunked)
    view.controller.setPart(getPartRects(chunked)[3])
    view.controller.setSelectedColor(1)

    // (行 2, 列 0) 落在画布里但属于第二块
    expect(view.controller.paintAt(30, 76).status).toBe('ignored')
    expect(view.commitPaint).not.toHaveBeenCalled()
    expect(view.controller.paintAt(126, 76)).toEqual({ status: 'painted', index: 10, colorId: 1 })
    expect(view.commitPaint).toHaveBeenCalledExactlyOnceWith(10, 1)
    view.controller.destroy()
  })

  it('stops a drag at the part boundary', () => {
    const view = setup(Array(16).fill(0), 'painted', true, chunked)
    view.controller.setPart(getPartRects(chunked)[0])
    view.controller.setSelectedColor(1)
    pointer(view.canvas, 'pointerdown', 126, 76)
    pointer(view.canvas, 'pointermove', 222, 76)
    pointer(view.canvas, 'pointerup', 222, 76)

    expect(view.onPaint.mock.calls.map(([result]) => [result.index, result.status]))
      .toEqual([[0, 'painted'], [1, 'incorrect']])
    expect(view.commitPaint).toHaveBeenCalledExactlyOnceWith(0, 1)
    view.controller.destroy()
  })

  it('refits the viewport when switching parts and drops the pan of the previous one', () => {
    const view = setup(Array(16).fill(0), 'painted', true, chunked)
    view.controller.setPart(getPartRects(chunked)[0])
    view.controller.panBy(30, 20)
    view.draw()
    expect(view.onViewportChange).toHaveBeenCalledExactlyOnceWith({ scale: 2, offsetX: 132, offsetY: 72 })

    view.controller.setPart(getPartRects(chunked)[1])
    view.draw()
    expect(view.context.translate).toHaveBeenLastCalledWith(6, 52)

    view.controller.panBy(10, 10)
    view.controller.resetViewport()
    view.draw()
    expect(view.context.translate).toHaveBeenLastCalledWith(6, 52)
    view.controller.destroy()
  })

  it('lowers the zoom floor for a whole large image and keeps it for one of its parts', () => {
    const whole = setup(Array(1024).fill(0), 'painted', false, solid(32, 32))
    whole.controller.setViewport({ scale: 0.05, offsetX: 0, offsetY: 0 })
    whole.draw()
    expect(whole.context.scale).toHaveBeenLastCalledWith(200 / 768, 200 / 768)
    whole.controller.destroy()

    const split = solid(32, 32, { cols: 2, rows: 2 })
    const part = setup(Array(1024).fill(0), 'painted', false, split)
    part.controller.setPart(getPartRects(split)[0])
    part.controller.setViewport({ scale: 0.05, offsetX: 0, offsetY: 0 })
    part.draw()
    expect(part.context.scale).toHaveBeenLastCalledWith(0.5, 0.5)
    part.controller.destroy()
  })
})
