import type { Level } from '../models/level'

export function validateLevel(level: Level): void {
  const { id, width, height, palette, cells } = level

  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new Error(`Level ${id}: width and height must be positive integers`)
  }

  if (cells.length !== width * height) {
    throw new Error(`Level ${id}: cells.length is ${cells.length}, expected ${width * height}`)
  }

  const colorIds = new Set<number>()
  for (const color of palette) {
    if (!Number.isInteger(color.id) || color.id < 1) {
      throw new Error(`Level ${id}: invalid palette ID ${color.id}`)
    }
    if (colorIds.has(color.id)) {
      throw new Error(`Level ${id}: duplicate palette ID ${color.id}`)
    }
    colorIds.add(color.id)
  }

  let hasInteractiveCell = false
  for (const [index, colorId] of cells.entries()) {
    if (colorId === 0) continue
    if (!colorIds.has(colorId)) {
      throw new Error(`Level ${id}: cells[${index}] references unknown color ID ${colorId}`)
    }
    hasInteractiveCell = true
  }

  if (!hasInteractiveCell) {
    throw new Error(`Level ${id}: no interactive cells`)
  }
}

export function getInteractiveCellCount(level: Level): number {
  return level.cells.filter((colorId) => colorId !== 0).length
}
