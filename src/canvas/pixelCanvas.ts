import type { Level, LevelViewport } from '../models/level'
import { cellsAlongSegment, screenToCell, screenToWorld, type Cell, type Point } from '../utils/coordinates'
import { createDefaultViewport, normalizeViewport, panViewport, zoomAround } from './viewport'

export type PaintStatus = 'painted' | 'incorrect' | 'ignored'
export type PaintResult =
  | { status: 'ignored'; index?: number }
  | { status: 'painted' | 'incorrect'; index: number; colorId: number }

export type PixelCanvasOptions = {
  canvas: HTMLCanvasElement
  level: Level
  readPainted: () => readonly number[]
  commitPaint: (index: number, colorId: number) => PaintStatus
  onPaint?: (result: PaintResult) => void
  onViewportChange?: (viewport: LevelViewport) => void
  autoFit?: boolean
}

export type PixelCanvasController = {
  available: boolean
  paintAt(screenX: number, screenY: number): PaintResult
  setSelectedColor(colorId: number | null): void
  zoomAt(screenX: number, screenY: number, delta: number): void
  panBy(deltaX: number, deltaY: number): void
  resetViewport(): void
  setViewport(viewport: LevelViewport): void
  setHint(index: number | null): void
  invalidate(): void
  destroy(): void
}

const cellSize = 24
const errorDuration = 180
const touchDragThreshold = 6
const fitScaleMax = 2
const singleDigitFont = 12
const doubleDigitFont = 9
const minLabelPixels = 6
type Gesture = 'pending' | 'paint' | 'pan' | 'pinch' | 'blocked'

function labelFont(target: number): number {
  return target >= 10 ? doubleDigitFont : singleDigitFont
}

function isDefaultViewport(viewport: LevelViewport): boolean {
  return viewport.scale === 1 && viewport.offsetX === 0 && viewport.offsetY === 0
}

function midpoint(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
}

function distance(first: Point, second: Point): number {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

export function createPixelCanvas(options: PixelCanvasOptions): PixelCanvasController {
  const { canvas, level, readPainted, commitPaint, onPaint, onViewportChange, autoFit = false } = options
  const context = canvas.getContext('2d')
  const palette = new Map(level.palette.map((color) => [color.id, color.hex]))
  let viewport = createDefaultViewport()
  let selectedColor: number | null = null
  let hintIndex: number | null = null
  let errorIndex: number | null = null
  let errorTimer: ReturnType<typeof setTimeout> | undefined
  let frame: number | undefined
  let viewportChanged = false
  let destroyed = false
  const pointers = new Map<number, Point>()
  const visited = new Set<number>()
  let gesture: Gesture = 'blocked'
  let touchGesture = false
  let touchOrigin: Point | undefined
  let userAdjusted = false

  // The fitted viewport is derived from the live canvas size, so it stays centered on resize
  // until the player pans or zooms, and it is never reported as a saved viewport.
  function fitViewport(): LevelViewport | null {
    const { width, height } = canvas.getBoundingClientRect()
    if (width <= 0 || height <= 0) return null
    const worldWidth = level.width * cellSize
    const worldHeight = level.height * cellSize
    const scale = Math.min(fitScaleMax, Math.max(0.5, Math.min(width / worldWidth, height / worldHeight)))
    return normalizeViewport({
      scale,
      offsetX: (width - worldWidth * scale) / 2,
      offsetY: (height - worldHeight * scale) / 2,
    })
  }

  function activeViewport(): LevelViewport {
    return (autoFit && !userAdjusted ? fitViewport() : null) ?? viewport
  }

  function beginUserViewport(): void {
    if (userAdjusted) return
    const fit = autoFit ? fitViewport() : null
    if (fit) viewport = fit
    userAdjusted = true
  }

  function draw(): void {
    if (!context) return
    const { width, height } = canvas.getBoundingClientRect()
    if (width <= 0 || height <= 0) return
    const dpr = globalThis.devicePixelRatio || 1
    const backingWidth = Math.max(1, Math.round(width * dpr))
    const backingHeight = Math.max(1, Math.round(height * dpr))
    if (canvas.width !== backingWidth) canvas.width = backingWidth
    if (canvas.height !== backingHeight) canvas.height = backingHeight

    const view = activeViewport()
    context.setTransform(backingWidth / width, 0, 0, backingHeight / height, 0, 0)
    context.fillStyle = '#11111b'
    context.fillRect(0, 0, width, height)
    context.translate(view.offsetX, view.offsetY)
    context.scale(view.scale, view.scale)
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    const topLeft = screenToWorld({ x: 0, y: 0 }, view)
    const bottomRight = screenToWorld({ x: width, y: height }, view)
    const firstRow = Math.max(0, Math.floor(topLeft.y / cellSize))
    const lastRow = Math.min(level.height, Math.ceil(bottomRight.y / cellSize))
    const firstColumn = Math.max(0, Math.floor(topLeft.x / cellSize))
    const lastColumn = Math.min(level.width, Math.ceil(bottomRight.x / cellSize))
    const painted = readPainted()

    for (let row = firstRow; row < lastRow; row += 1) {
      for (let column = firstColumn; column < lastColumn; column += 1) {
        const index = row * level.width + column
        const target = level.cells[index]
        if (target === 0) continue

        const x = column * cellSize
        const y = row * cellSize
        const filled = painted[index] === target
        context.fillStyle = filled ? palette.get(target) ?? '#f1f0f8' : '#f1f0f8'
        context.fillRect(x, y, cellSize, cellSize)
        context.lineWidth = 1 / view.scale
        context.strokeStyle = '#64647d'
        context.strokeRect(x, y, cellSize, cellSize)
        if (filled) continue

        // 两位数用更小字号，缩得太小时直接不画，避免糊成一片
        const fontPx = labelFont(target)
        if (view.scale * fontPx >= minLabelPixels) {
          context.fillStyle = '#292941'
          context.font = `${fontPx}px system-ui, sans-serif`
          context.fillText(String(target), x + cellSize / 2, y + cellSize / 2, cellSize - 4)
        }
        if (target === selectedColor) highlight(x, y, '#526dca', 1, view.scale)
        if (index === hintIndex) highlight(x, y, '#a25e00', 2, view.scale)
        if (index === errorIndex) highlight(x, y, '#d12b42', 2, view.scale)
      }
    }
  }

  function highlight(x: number, y: number, color: string, width: number, scale: number): void {
    if (!context) return
    context.strokeStyle = color
    context.lineWidth = width / scale
    context.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4)
  }

  function invalidate(): void {
    if (destroyed || !context || frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      draw()
      if (viewportChanged) {
        viewportChanged = false
        onViewportChange?.({ ...viewport })
      }
    })
  }

  function updateViewport(next: LevelViewport, userChange: boolean): void {
    if (destroyed || (next.scale === viewport.scale && next.offsetX === viewport.offsetX
      && next.offsetY === viewport.offsetY)) return
    viewport = next
    viewportChanged = userChange
    invalidate()
  }

  function flashError(index: number): void {
    clearTimeout(errorTimer)
    errorIndex = index
    errorTimer = setTimeout(() => {
      errorIndex = null
      errorTimer = undefined
      invalidate()
    }, errorDuration)
    invalidate()
  }

  function paintCell({ row, column }: Cell): PaintResult {
    const index = row * level.width + column
    const target = level.cells[index]
    if (selectedColor === null || target === 0 || readPainted()[index] === target) {
      return { status: 'ignored', index }
    }

    const colorId = selectedColor
    const status = target === colorId ? commitPaint(index, colorId) : 'incorrect'
    if (status === 'ignored') return { status, index }
    if (status === 'incorrect') flashError(index)
    else invalidate()
    const result = { status, index, colorId }
    onPaint?.(result)
    return result
  }

  function paintAt(screenX: number, screenY: number): PaintResult {
    if (destroyed || !context) return { status: 'ignored' }
    const { width, height } = canvas.getBoundingClientRect()
    if (screenX < 0 || screenY < 0 || screenX >= width || screenY >= height) {
      return { status: 'ignored' }
    }
    const cell = screenToCell({ x: screenX, y: screenY }, activeViewport(), cellSize, level)
    return cell ? paintCell(cell) : { status: 'ignored' }
  }

  function zoomAt(screenX: number, screenY: number, delta: number): void {
    if (!Number.isFinite(delta)) return
    beginUserViewport()
    const exponent = Math.min(20, Math.max(-20, -delta * 0.0015))
    const scale = viewport.scale * Math.exp(exponent)
    updateViewport(zoomAround(viewport, { x: screenX, y: screenY }, scale), true)
  }

  function panBy(deltaX: number, deltaY: number): void {
    beginUserViewport()
    updateViewport(panViewport(viewport, { x: deltaX, y: deltaY }), true)
  }

  function localPoint(event: MouseEvent): Point {
    const bounds = canvas.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }

  function paintSegment(from: Point, to: Point): void {
    const { width, height } = canvas.getBoundingClientRect()
    for (const cell of cellsAlongSegment(from, to, activeViewport(), cellSize, level, { width, height })) {
      if (destroyed) return
      const index = cell.row * level.width + cell.column
      if (visited.has(index)) continue
      visited.add(index)
      paintCell(cell)
    }
  }

  function changeCapture(id: number, capture: boolean): void {
    try {
      if (capture) canvas.setPointerCapture?.(id)
      else canvas.releasePointerCapture?.(id)
    } catch {
      // The pointer can end or lose capture before the browser receives the request.
    }
  }

  function pointerDown(event: PointerEvent): void {
    const touch = event.pointerType === 'touch'
    if (pointers.has(event.pointerId)) return
    if (pointers.size > 0 && (!touchGesture || !touch)) return
    if (!touch && event.button !== 0 && event.button !== 1 && event.button !== 2) return

    const point = localPoint(event)
    pointers.set(event.pointerId, point)
    changeCapture(event.pointerId, true)
    event.preventDefault()

    if (pointers.size === 1) {
      visited.clear()
      touchGesture = touch
      touchOrigin = touch ? point : undefined
      gesture = touch ? 'pending' : event.button === 0 ? 'paint' : 'pan'
      if (gesture === 'paint') paintSegment(point, point)
    } else if (pointers.size === 2 && gesture !== 'blocked') {
      gesture = 'pinch'
    } else {
      gesture = 'blocked'
    }
  }

  function pointerMove(event: PointerEvent): void {
    const previous = pointers.get(event.pointerId)
    if (!previous) return

    const point = localPoint(event)
    pointers.set(event.pointerId, point)
    let from = previous
    if (gesture === 'pending') {
      from = touchOrigin ?? previous
      if (distance(from, point) < touchDragThreshold) return
      gesture = 'paint'
    }

    if (gesture === 'paint') {
      if (point.x !== from.x || point.y !== from.y) paintSegment(from, point)
    } else if (gesture === 'pan') {
      panBy(point.x - previous.x, point.y - previous.y)
    } else if (gesture === 'pinch') {
      const other = [...pointers].find(([id]) => id !== event.pointerId)?.[1]
      if (!other) return
      beginUserViewport()
      const oldCenter = midpoint(previous, other)
      const newCenter = midpoint(point, other)
      const oldDistance = distance(previous, other)
      const newDistance = distance(point, other)
      const zoomed = oldDistance > 0 && newDistance > 0
        ? zoomAround(viewport, oldCenter, viewport.scale * newDistance / oldDistance)
        : viewport
      updateViewport(panViewport(zoomed, {
        x: newCenter.x - oldCenter.x,
        y: newCenter.y - oldCenter.y,
      }), true)
    }
  }

  function endPointer(event: PointerEvent): void {
    if (!pointers.has(event.pointerId)) return
    if (event.type === 'pointerup') {
      if (gesture === 'pending' || gesture === 'paint' || gesture === 'pan') pointerMove(event)
      if (gesture === 'pending') {
        const point = localPoint(event)
        paintSegment(point, point)
      }
    }
    pointers.delete(event.pointerId)
    gesture = 'blocked'
    touchOrigin = undefined
    if (pointers.size === 0) visited.clear()
    if (event.type !== 'lostpointercapture') changeCapture(event.pointerId, false)
  }

  function wheel(event: WheelEvent): void {
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2
      ? canvas.getBoundingClientRect().height : 1
    if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return
    event.preventDefault()
    const point = localPoint(event)
    zoomAt(point.x, point.y, event.deltaY * unit)
  }

  function contextMenu(event: MouseEvent): void {
    event.preventDefault()
  }

  const pointerListeners = {
    pointerdown: pointerDown,
    pointermove: pointerMove,
    pointerup: endPointer,
    pointercancel: endPointer,
    lostpointercapture: endPointer,
  }
  const observer = context && typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(invalidate) : undefined
  observer?.observe(canvas)
  if (context) {
    window.addEventListener('resize', invalidate)
    for (const [type, listener] of Object.entries(pointerListeners)) {
      canvas.addEventListener(type, listener as EventListener)
    }
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('contextmenu', contextMenu)
  }
  invalidate()

  return {
    available: context !== null,
    paintAt,
    setSelectedColor(colorId) {
      selectedColor = colorId !== null && palette.has(colorId) ? colorId : null
      invalidate()
    },
    zoomAt,
    panBy,
    resetViewport() {
      userAdjusted = false
      updateViewport(createDefaultViewport(), true)
    },
    setViewport(next) {
      const normalized = normalizeViewport(next)
      userAdjusted = !isDefaultViewport(normalized)
      updateViewport(normalized, false)
    },
    setHint(index) {
      hintIndex = index
      invalidate()
    },
    invalidate,
    destroy() {
      if (destroyed) return
      destroyed = true
      for (const [type, listener] of Object.entries(pointerListeners)) {
        canvas.removeEventListener(type, listener as EventListener)
      }
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('contextmenu', contextMenu)
      for (const id of pointers.keys()) changeCapture(id, false)
      pointers.clear()
      visited.clear()
      observer?.disconnect()
      window.removeEventListener('resize', invalidate)
      if (frame !== undefined) cancelAnimationFrame(frame)
      clearTimeout(errorTimer)
    },
  }
}
