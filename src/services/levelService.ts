import { levelCategories, normalizeCategory, type LevelCategoryEntry } from '../data/categories'
import { presetLevels } from '../data/levels'
import type { Level } from '../models/level'

const levelIds = new Set<string>()
for (const level of presetLevels) {
  if (levelIds.has(level.id)) {
    throw new Error(`Duplicate preset level ID ${level.id}`)
  }
  validateLevel(level)
  levelIds.add(level.id)
}

export function getLevels(): Level[] {
  return [...presetLevels]
}

export function getLevelById(id: string): Level | undefined {
  return presetLevels.find((level) => level.id === id)
}

export function getCategories(): LevelCategoryEntry[] {
  const present = new Set(presetLevels.map((level) => normalizeCategory(level.category).id))
  return levelCategories.filter((entry) => present.has(entry.id))
}

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
