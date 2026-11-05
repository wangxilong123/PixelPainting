import { describe, expect, it } from 'vitest'
import { cellsAlongSegment, screenToCell, screenToWorld, worldToScreen } from './coordinates'

const origin = { scale: 1, offsetX: 0, offsetY: 0 }
const transformed = { scale: 2, offsetX: 30, offsetY: -10 }

describe('canvas coordinates', () => {
  it('round trips between world and local screen points', () => {
    const screen = worldToScreen({ x: 8, y: 12 }, transformed)
    expect(screen).toEqual({ x: 46, y: 14 })
    expect(screenToWorld(screen, transformed)).toEqual({ x: 8, y: 12 })
    expect(screenToCell({ x: 90, y: 42 }, transformed, 24)).toEqual({ row: 1, column: 1 })
  })

  it('uses half-open bounds and rejects invalid inputs', () => {
    const grid = { width: 3, height: 2 }
    expect(screenToCell({ x: 0, y: 0 }, origin, 24, grid)).toEqual({ row: 0, column: 0 })
    for (const point of [{ x: -0.1, y: 0 }, { x: 72, y: 0 }, { x: 0, y: 48 }, { x: NaN, y: 0 }]) {
      expect(screenToCell(point, origin, 24, grid)).toBeNull()
    }
    expect(screenToCell({ x: 0, y: 0 }, origin, 0)).toBeNull()
    for (const scale of [0, -1]) {
      expect(screenToCell({ x: 0, y: 0 }, { ...origin, scale }, 24)).toBeNull()
    }
  })

  it('includes all crossed cells and clips a segment with outside endpoints', () => {
    const grid = { width: 4, height: 2 }
    const expected = [0, 1, 2, 3].map((column) => ({ row: 0, column }))
    expect(cellsAlongSegment({ x: 12, y: 12 }, { x: 84, y: 12 }, origin, 24, grid))
      .toEqual(expected)
    expect(cellsAlongSegment({ x: 150, y: 12 }, { x: -10, y: 12 }, origin, 24, grid))
      .toEqual([...expected].reverse())
  })

  it('steps diagonally at a corner and excludes the outer bottom edge', () => {
    const grid = { width: 2, height: 2 }
    expect(cellsAlongSegment({ x: 12, y: 12 }, { x: 36, y: 36 }, origin, 24, grid))
      .toEqual([{ row: 0, column: 0 }, { row: 1, column: 1 }])
    expect(cellsAlongSegment({ x: 12, y: 48 }, { x: 36, y: 48 }, origin, 24, grid)).toEqual([])
  })
})
