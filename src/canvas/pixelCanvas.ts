import type { Level, LevelViewport } from '../models/level'
import { screenToCell, screenToWorld, type Cell } from '../utils/coordinates'
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

export function createPixelCanvas(options: PixelCanvasOptions): PixelCanvasController {
  const { canvas, level, readPainted, commitPaint, onPaint, onViewportChange } = options
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

  function draw(): void {
    if (!context) return
    const { width, height } = canvas.getBoundingClientRect()
    if (width <= 0 || height <= 0) return
    const dpr = globalThis.devicePixelRatio || 1
    const backingWidth = Math.max(1, Math.round(width * dpr))
    const backingHeight = Math.max(1, Math.round(height * dpr))
    if (canvas.width !== backingWidth) canvas.width = backingWidth
    if (canvas.height !== backingHeight) canvas.height = backingHeight

    context.setTransform(backingWidth / width, 0, 0, backingHeight / height, 0, 0)
    context.fillStyle = '#11111b'
    context.fillRect(0, 0, width, height)
    context.translate(viewport.offsetX, viewport.offsetY)
    context.scale(viewport.scale, viewport.scale)
    context.font = '12px system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    const topLeft = screenToWorld({ x: 0, y: 0 }, viewport)
    const bottomRight = screenToWorld({ x: width, y: height }, viewport)
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
        context.lineWidth = 1 / viewport.scale
        context.strokeStyle = '#64647d'
        context.strokeRect(x, y, cellSize, cellSize)
        if (filled) continue

        context.fillStyle = '#292941'
        context.fillText(String(target), x + cellSize / 2, y + cellSize / 2, cellSize - 6)
        if (target === selectedColor) highlight(x, y, '#526dca', 1)
        if (index === hintIndex) highlight(x, y, '#a25e00', 2)
        if (index === errorIndex) highlight(x, y, '#d12b42', 2)
      }
    }
  }

  function highlight(x: number, y: number, color: string, width: number): void {
    if (!context) return
    context.strokeStyle = color
    context.lineWidth = width / viewport.scale
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
    const cell = screenToCell({ x: screenX, y: screenY }, viewport, cellSize, level)
    return cell ? paintCell(cell) : { status: 'ignored' }
  }

  function zoomAt(screenX: number, screenY: number, delta: number): void {
    if (!Number.isFinite(delta)) return
    const exponent = Math.min(20, Math.max(-20, -delta * 0.0015))
    const scale = viewport.scale * Math.exp(exponent)
    updateViewport(zoomAround(viewport, { x: screenX, y: screenY }, scale), true)
  }

  function panBy(deltaX: number, deltaY: number): void {
    updateViewport(panViewport(viewport, { x: deltaX, y: deltaY }), true)
  }

  const observer = context && typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(invalidate) : undefined
  observer?.observe(canvas)
  if (context) window.addEventListener('resize', invalidate)
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
    resetViewport() { updateViewport(createDefaultViewport(), true) },
    setViewport(next) { updateViewport(normalizeViewport(next), false) },
    setHint(index) {
      hintIndex = index
      invalidate()
    },
    invalidate,
    destroy() {
      if (destroyed) return
      destroyed = true
      observer?.disconnect()
      window.removeEventListener('resize', invalidate)
      if (frame !== undefined) cancelAnimationFrame(frame)
      clearTimeout(errorTimer)
    },
  }
}
