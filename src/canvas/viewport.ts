import type { LevelViewport } from '../models/level'
import { screenToWorld, type GridSize, type Point } from '../utils/coordinates'

const minScale = 0.5
const maxScale = 4

export type ViewportBounds = {
  /** Canvas size in CSS pixels. */
  viewport: GridSize
  /** World region that must stay fully visible, in world pixels. */
  world: GridSize
}

function isPositiveSize(size: number): boolean {
  return Number.isFinite(size) && size > 0
}

// 分块和大图都要能整块缩到可见，所以下限跟着"画布装下这块"的适配比例走，
// 装得下时仍是 0.5；不传 bounds 的调用保持原样
function floorScale(bounds?: ViewportBounds): number {
  if (!bounds) return minScale
  const { viewport, world } = bounds
  if (![viewport.width, viewport.height, world.width, world.height].every(isPositiveSize)) {
    return minScale
  }
  return Math.min(minScale, viewport.width / world.width, viewport.height / world.height)
}

function clampScale(scale: number, bounds?: ViewportBounds): number {
  return Math.max(floorScale(bounds), Math.min(maxScale, scale))
}

export function createDefaultViewport(): LevelViewport {
  return { scale: 1, offsetX: 0, offsetY: 0 }
}

export function normalizeViewport(
  viewport: LevelViewport,
  bounds?: ViewportBounds,
): LevelViewport {
  const { scale, offsetX, offsetY } = viewport
  if (![scale, offsetX, offsetY].every(Number.isFinite) || scale <= 0) return createDefaultViewport()
  return { scale: clampScale(scale, bounds), offsetX, offsetY }
}

export function zoomAround(
  viewport: LevelViewport,
  anchor: Point,
  targetScale: number,
  bounds?: ViewportBounds,
): LevelViewport {
  if (![anchor.x, anchor.y, targetScale].every(Number.isFinite) || targetScale <= 0) return viewport
  const scale = clampScale(targetScale, bounds)
  if (scale === viewport.scale) return viewport

  const world = screenToWorld(anchor, viewport)
  const offsetX = anchor.x - world.x * scale
  const offsetY = anchor.y - world.y * scale
  if (![offsetX, offsetY].every(Number.isFinite)) return viewport
  return { scale, offsetX, offsetY }
}

export function panViewport(viewport: LevelViewport, delta: Point): LevelViewport {
  const offsetX = viewport.offsetX + delta.x
  const offsetY = viewport.offsetY + delta.y
  if (![offsetX, offsetY].every(Number.isFinite)) return viewport
  return { ...viewport, offsetX, offsetY }
}
