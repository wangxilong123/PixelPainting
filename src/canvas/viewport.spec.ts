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
})
