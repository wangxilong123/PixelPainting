import type { LevelViewport } from '../models/level'

export type Point = { x: number; y: number }
export type Cell = { row: number; column: number }
export type GridSize = { width: number; height: number }

export function worldToScreen(point: Point, viewport: LevelViewport): Point {
  return {
    x: point.x * viewport.scale + viewport.offsetX,
    y: point.y * viewport.scale + viewport.offsetY,
  }
}

export function screenToWorld(point: Point, viewport: LevelViewport): Point {
  return {
    x: (point.x - viewport.offsetX) / viewport.scale,
    y: (point.y - viewport.offsetY) / viewport.scale,
  }
}

function worldToCell(point: Point, cellSize: number, grid?: GridSize): Cell | null {
  const column = Math.floor(point.x / cellSize)
  const row = Math.floor(point.y / cellSize)
  if (!Number.isFinite(row) || !Number.isFinite(column) || row < 0 || column < 0) return null
  if (grid && (row >= grid.height || column >= grid.width)) return null
  return { row, column }
}

function hasValidScale(viewport: LevelViewport, cellSize: number): boolean {
  return Number.isFinite(viewport.scale) && viewport.scale > 0
    && Number.isFinite(cellSize) && cellSize > 0
}

export function screenToCell(
  point: Point,
  viewport: LevelViewport,
  cellSize: number,
  grid?: GridSize,
): Cell | null {
  if (!hasValidScale(viewport, cellSize)) return null
  return worldToCell(screenToWorld(point, viewport), cellSize, grid)
}

function clipAxis(start: number, delta: number, extent: number): [number, number] | null {
  if (delta === 0) return start >= 0 && start < extent ? [0, 1] : null
  const first = -start / delta
  const last = (extent - start) / delta
  return [Math.min(first, last), Math.max(first, last)]
}

export function cellsAlongSegment(
  from: Point,
  to: Point,
  viewport: LevelViewport,
  cellSize: number,
  grid: GridSize,
  screenBounds?: GridSize,
): Cell[] {
  if (!hasValidScale(viewport, cellSize) || grid.width < 1 || grid.height < 1) return []
  const start = screenToWorld(from, viewport)
  const end = screenToWorld(to, viewport)
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (![start.x, start.y, dx, dy].every(Number.isFinite)) return []

  const xRange = clipAxis(start.x, dx, grid.width * cellSize)
  const yRange = clipAxis(start.y, dy, grid.height * cellSize)
  if (!xRange || !yRange) return []

  const screenX = screenBounds ? clipAxis(from.x, to.x - from.x, screenBounds.width) : [0, 1]
  const screenY = screenBounds ? clipAxis(from.y, to.y - from.y, screenBounds.height) : [0, 1]
  if (!screenX || !screenY) return []

  const enter = Math.max(0, xRange[0], yRange[0], screenX[0], screenY[0])
  const exit = Math.min(1, xRange[1], yRange[1], screenX[1], screenY[1])
  if (enter > exit) return []
  if (dx === 0 && dy === 0) {
    const cell = worldToCell(start, cellSize, grid)
    return cell ? [cell] : []
  }

  const crossings = [enter, exit]
  function addCrossings(origin: number, delta: number, size: number): void {
    if (delta === 0) return
    const first = origin + delta * enter
    const last = origin + delta * exit
    const min = Math.max(1, Math.floor(Math.min(first, last) / cellSize) + 1)
    const max = Math.min(size - 1, Math.ceil(Math.max(first, last) / cellSize) - 1)
    for (let line = min; line <= max; line += 1) {
      const time = (line * cellSize - origin) / delta
      if (time > enter && time < exit) crossings.push(time)
    }
  }
  addCrossings(start.x, dx, grid.width)
  addCrossings(start.y, dy, grid.height)
  crossings.sort((a, b) => a - b)

  const cells: Cell[] = []
  function append(point: Point): void {
    const cell = worldToCell(point, cellSize, grid)
    const last = cells[cells.length - 1]
    if (cell && (cell.row !== last?.row || cell.column !== last?.column)) cells.push(cell)
  }

  // Only sample the interior between crossings so corner contacts do not paint adjacent cells.
  for (let index = 1; index < crossings.length; index += 1) {
    const previous = crossings[index - 1]
    const current = crossings[index]
    if (current - previous <= Number.EPSILON * 4) continue
    const middle = (previous + current) / 2
    append({ x: start.x + dx * middle, y: start.y + dy * middle })
  }
  return cells
}
