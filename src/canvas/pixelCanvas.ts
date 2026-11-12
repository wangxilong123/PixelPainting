import type { PixelArtwork } from '../models/artwork'
import type { LevelViewport } from '../models/level'
import type { PartRect } from '../services/levelService'
import { cellsAlongSegment, screenToCell, screenToWorld, type Cell, type Point } from '../utils/coordinates'
import {
  createDefaultViewport,
  normalizeViewport,
  panViewport,
  zoomAround,
  type ViewportBounds,
} from './viewport'

export type PaintStatus = 'painted' | 'incorrect' | 'ignored'
export type PaintResult =
  | { status: 'ignored'; index?: number }
  | { status: 'painted' | 'incorrect'; index: number; colorId: number }

/** 整图预览：画整张图并叠分块边界，done 按 part.index 取，next 是要涂的下一块 */
export type PartOverview = {
  parts: readonly PartRect[]
  done: readonly boolean[]
  next: number | null
}

export type PixelCanvasOptions = {
  canvas: HTMLCanvasElement
  level: PixelArtwork
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
  setPart(rect: PartRect | null, animate?: boolean): void
  setOverview(overview: PartOverview | null, animate?: boolean): void
  setHint(index: number | null): void
  centerOnCell(index: number): void
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
const transitionDuration = 480
const emptyFill = '#f1f0f8'
const emptyChannels = [241, 240, 248]
const tintStrength = 0.22
type Gesture = 'pending' | 'paint' | 'pan' | 'pinch' | 'blocked'

type ViewportAnimation = {
  from: LevelViewport
  to: LevelViewport
  start: number
  duration: number
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function labelFont(target: number): number {
  return target >= 10 ? doubleDigitFont : singleDigitFont
}

// 未涂色的格子透出一点目标色，玩家不看编号也能大致分辨区域
function tintTowardsEmpty(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) return emptyFill
  const value = Number.parseInt(match[1], 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  const mixed = channels.map((channel, index) => {
    const base = emptyChannels[index]
    return Math.round(base + (channel - base) * tintStrength).toString(16).padStart(2, '0')
  })
  return `#${mixed.join('')}`
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
  const emptyFills = new Map(level.palette.map((color) => [color.id, tintTowardsEmpty(color.hex)]))
  let viewport = createDefaultViewport()
  let part: PartRect | null = null
  let overview: PartOverview | null = null
  let animation: ViewportAnimation | undefined
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
  const reducedMotion = typeof globalThis.matchMedia === 'function'
    && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches

  // 分块只是绘制和命中的裁剪范围，格子坐标和 index 仍然按整图算
  function activePart(): PartRect {
    return part ?? { index: 0, x: 0, y: 0, width: level.width, height: level.height }
  }

  function scaleBounds(): ViewportBounds | undefined {
    const { width, height } = canvas.getBoundingClientRect()
    if (width <= 0 || height <= 0) return undefined
    const rect = activePart()
    return {
      viewport: { width, height },
      world: { width: rect.width * cellSize, height: rect.height * cellSize },
    }
  }

  // The fitted viewport is derived from the live canvas size, so it stays centered on resize
  // until the player pans or zooms, and it is never reported as a saved viewport.
  function fitViewport(): LevelViewport | null {
    const { width, height } = canvas.getBoundingClientRect()
    if (width <= 0 || height <= 0) return null
    const rect = activePart()
    const worldWidth = rect.width * cellSize
    const worldHeight = rect.height * cellSize
    const scale = Math.min(fitScaleMax, Math.min(width / worldWidth, height / worldHeight))
    return normalizeViewport({
      scale,
      offsetX: (width - worldWidth * scale) / 2 - rect.x * cellSize * scale,
      offsetY: (height - worldHeight * scale) / 2 - rect.y * cellSize * scale,
    }, { viewport: { width, height }, world: { width: worldWidth, height: worldHeight } })
  }

  function activeViewport(): LevelViewport {
    if (animation) {
      const t = Math.min(1, (performance.now() - animation.start) / animation.duration)
      const eased = easeInOutCubic(t)
      return {
        scale: animation.from.scale + (animation.to.scale - animation.from.scale) * eased,
        offsetX: animation.from.offsetX + (animation.to.offsetX - animation.from.offsetX) * eased,
        offsetY: animation.from.offsetY + (animation.to.offsetY - animation.from.offsetY) * eased,
      }
    }
    return (autoFit && !userAdjusted ? fitViewport() : null) ?? viewport
  }

  // 整图预览和分块之间切换时平滑缩放过去；适配视口是程序推出来的，不上报存档。
  // from 必须在改 part/overview 之前取：自动适配的起点是旧状态的适配位置，
  // 改完再取就和终点重合，补间永远不会跑
  function startTransition(from: LevelViewport, target: LevelViewport, animate: boolean): void {
    userAdjusted = false
    viewport = target
    const same = from.scale === target.scale && from.offsetX === target.offsetX
      && from.offsetY === target.offsetY
    animation = !animate || reducedMotion || same ? undefined : {
      from, to: target, start: performance.now(), duration: transitionDuration,
    }
    invalidate()
  }

  function beginUserViewport(): void {
    // 补间进行中：接管当前插值位置，不能再被适配位置覆盖
    if (animation) {
      viewport = activeViewport()
      animation = undefined
      userAdjusted = true
      return
    }
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
    const rect = activePart()
    const firstRow = Math.max(rect.y, Math.floor(topLeft.y / cellSize))
    const lastRow = Math.min(rect.y + rect.height, Math.ceil(bottomRight.y / cellSize))
    const firstColumn = Math.max(rect.x, Math.floor(topLeft.x / cellSize))
    const lastColumn = Math.min(rect.x + rect.width, Math.ceil(bottomRight.x / cellSize))
    const painted = readPainted()

    for (let row = firstRow; row < lastRow; row += 1) {
      for (let column = firstColumn; column < lastColumn; column += 1) {
        const index = row * level.width + column
        const target = level.cells[index]
        if (target === 0) continue

        const x = column * cellSize
        const y = row * cellSize
        const filled = painted[index] === target
        context.fillStyle = filled
          ? palette.get(target) ?? emptyFill
          : emptyFills.get(target) ?? emptyFill
        context.fillRect(x, y, cellSize, cellSize)
        // 预览是成品视角：不描网格、不写编号，结构交给分块覆盖层
        if (overview) continue
        // 涂满的格子不再描边，成品是一整块干净的画；网格线只留在没涂的格子上
        if (filled) continue
        context.lineWidth = 1 / view.scale
        context.strokeStyle = '#64647d'
        context.strokeRect(x, y, cellSize, cellSize)

        // 编号按屏幕恒定字号：缩小时不再糊到隐藏，放大时也不超过格子留边
        const fontPx = labelFont(target)
        const screenFont = Math.min(Math.max(fontPx * view.scale, fontPx), cellSize * view.scale - 4)
        if (screenFont >= minLabelPixels) {
          context.fillStyle = '#292941'
          context.font = `${screenFont / view.scale}px system-ui, sans-serif`
          context.fillText(String(target), x + cellSize / 2, y + cellSize / 2, cellSize - 4)
        }
        if (target === selectedColor) highlight(x, y, '#526dca', 1, view.scale)
        if (index === hintIndex) highlight(x, y, '#a25e00', 2, view.scale)
        if (index === errorIndex) highlight(x, y, '#d12b42', 2, view.scale)
      }
    }

    if (overview) drawOverview(view)
  }

  // 分块覆盖层：边界线屏幕恒定粗细，完成的块打勾，下一块描亮边并标块号
  function drawOverview(view: LevelViewport): void {
    if (!context || !overview) return
    const scale = view.scale
    for (const rect of overview.parts) {
      const x = rect.x * cellSize
      const y = rect.y * cellSize
      const width = rect.width * cellSize
      const height = rect.height * cellSize
      const isNext = rect.index === overview.next
      const isDone = overview.done[rect.index] ?? false

      if (isNext) {
        context.strokeStyle = 'rgba(255, 204, 102, 0.28)'
        context.lineWidth = 8 / scale
        context.strokeRect(x, y, width, height)
      }
      context.strokeStyle = isNext ? '#ffcc66' : isDone ? 'rgba(124, 227, 139, 0.65)' : '#6a6a99'
      context.lineWidth = (isNext ? 2.5 : 1.5) / scale
      context.strokeRect(x, y, width, height)

      if (isDone || isNext) drawPartBadge(x + width, y, rect.index + 1, isDone, scale)
    }
  }

  function drawPartBadge(right: number, top: number, label: number, done: boolean, scale: number): void {
    if (!context) return
    const radius = 10 / scale
    const cx = right - radius - 6 / scale
    const cy = top + radius + 6 / scale
    context.beginPath()
    context.arc(cx, cy, radius, 0, Math.PI * 2)
    context.fillStyle = done ? '#7ce38b' : '#ffcc66'
    context.fill()
    if (done) {
      context.strokeStyle = '#11111b'
      context.lineWidth = 2 / scale
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.beginPath()
      context.moveTo(cx - 4.5 / scale, cy + 0.5 / scale)
      context.lineTo(cx - 1.5 / scale, cy + 3.5 / scale)
      context.lineTo(cx + 5 / scale, cy - 4 / scale)
      context.stroke()
    } else {
      context.fillStyle = '#11111b'
      context.font = `600 ${11 / scale}px system-ui, sans-serif`
      context.fillText(String(label), cx, cy + 0.5 / scale, radius * 2 - 4 / scale)
    }
  }

  function highlight(x: number, y: number, color: string, width: number, scale: number): void {
    if (!context) return
    context.strokeStyle = color
    context.lineWidth = width / scale
    context.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4)
  }

  function tick(): void {
    frame = undefined
    draw()
    if (animation) {
      if (performance.now() - animation.start >= animation.duration) {
        animation = undefined
      } else {
        frame = requestAnimationFrame(tick)
        return
      }
    }
    if (viewportChanged) {
      viewportChanged = false
      onViewportChange?.({ ...viewport })
    }
  }

  function invalidate(): void {
    if (destroyed || !context || frame !== undefined) return
    frame = requestAnimationFrame(tick)
  }

  function updateViewport(next: LevelViewport, userChange: boolean): void {
    if (destroyed || (next.scale === viewport.scale && next.offsetX === viewport.offsetX
      && next.offsetY === viewport.offsetY)) return
    animation = undefined
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
    const rect = activePart()
    if (row < rect.y || row >= rect.y + rect.height
      || column < rect.x || column >= rect.x + rect.width) {
      return { status: 'ignored' }
    }

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
    if (destroyed || !context || overview) return { status: 'ignored' }
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
    updateViewport(zoomAround(viewport, { x: screenX, y: screenY }, scale, scaleBounds()), true)
  }

  function panBy(deltaX: number, deltaY: number): void {
    beginUserViewport()
    updateViewport(panViewport(viewport, { x: deltaX, y: deltaY }), true)
  }

  // 提示要把目标格送到画布中央，玩家缩放平移之后高亮环可能已经落在视野外
  function centerOnCell(index: number): void {
    if (destroyed || !Number.isInteger(index) || index < 0 || index >= level.cells.length) return
    const { width, height } = canvas.getBoundingClientRect()
    if (width <= 0 || height <= 0) return
    beginUserViewport()
    const scale = viewport.scale
    updateViewport({
      scale,
      offsetX: width / 2 - ((index % level.width) + 0.5) * cellSize * scale,
      offsetY: height / 2 - (Math.floor(index / level.width) + 0.5) * cellSize * scale,
    }, true)
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
    // 整图预览只看不涂，手势整个放行给页面
    if (overview) return
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
        ? zoomAround(viewport, oldCenter, viewport.scale * newDistance / oldDistance, scaleBounds())
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
    if (overview) return
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
    centerOnCell,
    resetViewport() {
      userAdjusted = false
      updateViewport(createDefaultViewport(), true)
    },
    setViewport(next) {
      const normalized = normalizeViewport(next, scaleBounds())
      userAdjusted = !isDefaultViewport(normalized)
      updateViewport(normalized, false)
    },
    // 换块时视口回到该块的适配位置，玩家手动调过的缩放和平移不跨块保留
    setPart(rect, animate = false) {
      const from = activeViewport()
      part = rect
      startTransition(from, fitViewport() ?? createDefaultViewport(), animate)
    },
    // 进入整图预览：画整张图、叠分块边界；退出预览只清状态，视口交给 setPart 接管
    setOverview(next, animate = false) {
      const from = activeViewport()
      overview = next
      if (!next) {
        invalidate()
        return
      }
      part = null
      hintIndex = null
      startTransition(from, fitViewport() ?? createDefaultViewport(), animate)
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
