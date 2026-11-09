import { describe, expect, it } from 'vitest'
import { screenToWorld } from '../utils/coordinates'
import { createDefaultViewport, normalizeViewport, panViewport, zoomAround } from './viewport'

describe('viewport', () => {
  it('keeps the world point under the zoom anchor', () => {
    const origin = createDefaultViewport()
    const anchor = { x: 48, y: 24 }
    const zoomed = zoomAround(origin, anchor, 2)
    expect(zoomed).toEqual({ scale: 2, offsetX: -48, offsetY: -24 })
    expect(screenToWorld(anchor, zoomed)).toEqual(screenToWorld(anchor, origin))
  })

  it('limits scale without shifting an already clamped viewport', () => {
    const anchor = { x: 30, y: 20 }
    const max = zoomAround(createDefaultViewport(), anchor, 50)
    expect(max.scale).toBe(4)
    expect(zoomAround(max, anchor, 100)).toEqual(max)
    expect(zoomAround(max, anchor, 0.01).scale).toBe(0.5)
  })

  it('pans only the offsets and restores invalid snapshots to defaults', () => {
    const viewport = { scale: 2, offsetX: 30, offsetY: -10 }
    expect(panViewport(viewport, { x: 7, y: -8 })).toEqual({ scale: 2, offsetX: 37, offsetY: -18 })
    expect(panViewport(viewport, { x: Infinity, y: 0 })).toEqual(viewport)
    expect(normalizeViewport({ ...viewport, scale: 0 })).toEqual(createDefaultViewport())
    expect(normalizeViewport({ ...viewport, scale: 8 })).toEqual({ ...viewport, scale: 4 })
    expect(createDefaultViewport()).toEqual({ scale: 1, offsetX: 0, offsetY: 0 })
  })

  it('lowers the scale floor until the whole bounds stay visible', () => {
    // 600×200 的画布要装下 3000×2000 的世界需要 0.1，比默认的 0.5 下限低
    const bounds = { viewport: { width: 600, height: 200 }, world: { width: 3000, height: 2000 } }

    expect(normalizeViewport({ scale: 0.01, offsetX: 0, offsetY: 0 }, bounds).scale).toBe(0.1)
    expect(zoomAround(createDefaultViewport(), { x: 0, y: 0 }, 0.01, bounds).scale).toBe(0.1)
    expect(normalizeViewport({ scale: 8, offsetX: 0, offsetY: 0 }, bounds).scale).toBe(4)
    expect(normalizeViewport({ scale: 0.01, offsetX: 0, offsetY: 0 }).scale).toBe(0.5)
  })

  it('keeps the default floor when the bounds already fit at 0.5', () => {
    const bounds = { viewport: { width: 600, height: 200 }, world: { width: 600, height: 200 } }

    expect(normalizeViewport({ scale: 0.2, offsetX: 0, offsetY: 0 }, bounds).scale).toBe(0.5)
    expect(zoomAround(createDefaultViewport(), { x: 0, y: 0 }, 0.01, bounds).scale).toBe(0.5)
  })

  it('keeps the world point under the anchor while zooming out past the default floor', () => {
    const bounds = { viewport: { width: 600, height: 200 }, world: { width: 2400, height: 800 } }
    const anchor = { x: 48, y: 24 }
    const zoomed = zoomAround(createDefaultViewport(), anchor, 0.05, bounds)

    expect(zoomed).toEqual({ scale: 0.25, offsetX: 36, offsetY: 18 })
    expect(screenToWorld(anchor, zoomed)).toEqual(screenToWorld(anchor, createDefaultViewport()))
  })

  it.each([
    { viewport: { width: 0, height: 200 }, world: { width: 3000, height: 2000 } },
    { viewport: { width: 600, height: -1 }, world: { width: 3000, height: 2000 } },
    { viewport: { width: 600, height: 200 }, world: { width: 0, height: 2000 } },
    { viewport: { width: 600, height: 200 }, world: { width: 3000, height: Number.NaN } },
  ])('ignores unusable bounds %j and keeps the default floor', (bounds) => {
    expect(normalizeViewport({ scale: 0.01, offsetX: 0, offsetY: 0 }, bounds).scale).toBe(0.5)
  })
})
