import type { LevelViewport } from '../models/level'
import { screenToWorld, type Point } from '../utils/coordinates'

const minScale = 0.5
const maxScale = 4

function clampScale(scale: number): number {
  return Math.max(minScale, Math.min(maxScale, scale))
}

export function createDefaultViewport(): LevelViewport {
  return { scale: 1, offsetX: 0, offsetY: 0 }
}

export function normalizeViewport(viewport: LevelViewport): LevelViewport {
  const { scale, offsetX, offsetY } = viewport
  if (![scale, offsetX, offsetY].every(Number.isFinite) || scale <= 0) return createDefaultViewport()
  return { scale: clampScale(scale), offsetX, offsetY }
}

export function zoomAround(
  viewport: LevelViewport,
  anchor: Point,
  targetScale: number,
): LevelViewport {
  if (![anchor.x, anchor.y, targetScale].every(Number.isFinite) || targetScale <= 0) return viewport
  const scale = clampScale(targetScale)
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
