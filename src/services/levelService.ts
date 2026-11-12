import { levelCategories, normalizeCategory, type LevelCategoryEntry } from '../data/categories'
import { presetLevels } from '../data/levels'
import type { PixelArtwork } from '../models/artwork'
import type { Level, LevelParts } from '../models/level'

export type PartRect = {
  index: number
  x: number
  y: number
  width: number
  height: number
}

const partCounts = new Set([2, 3])

const levelIds = new Set<string>()
for (const level of presetLevels) {
  if (levelIds.has(level.id)) {
    throw new Error(`Duplicate preset level ID ${level.id}`)
  }
  validateLevel(level)
  levelIds.add(level.id)
}

export function sortLevels(levels: readonly Level[]): Level[] {
  return levels
    .map((level, index) => ({ level, index }))
    .sort((a, b) => {
      const left = a.level.order
      const right = b.level.order
      if (left === undefined && right === undefined) return a.index - b.index
      if (left === undefined) return 1
      if (right === undefined) return -1
      return left - right || a.index - b.index
    })
    .map((entry) => entry.level)
}

export function getLevels(): Level[] {
  return sortLevels(presetLevels)
}

export function getLevelById(id: string): Level | undefined {
  return presetLevels.find((level) => level.id === id)
}

export function getCategories(): LevelCategoryEntry[] {
  const present = new Set(presetLevels.map((level) => normalizeCategory(level.category).id))
  return levelCategories.filter((entry) => present.has(entry.id))
}

export function validateLevel(level: PixelArtwork): void {
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

export function getInteractiveCellCount(level: PixelArtwork): number {
  return level.cells.filter((colorId) => colorId !== 0).length
}

export function normalizeParts(level: PixelArtwork): LevelParts {
  const { cols, rows } = level.parts ?? { cols: 1, rows: 1 }
  if (cols !== rows || !partCounts.has(cols)) return { cols: 1, rows: 1 }
  return { cols, rows }
}

function splitAxis(total: number, count: number): number[] {
  const base = Math.floor(total / count)
  const remainder = total % count
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0))
}

function axisPart(sizes: number[], position: number): number {
  let offset = 0
  for (const [index, size] of sizes.entries()) {
    offset += size
    if (position < offset) return index
  }
  return sizes.length - 1
}

export function getPartRects(level: PixelArtwork): PartRect[] {
  const { cols, rows } = normalizeParts(level)
  const widths = splitAxis(level.width, cols)
  const heights = splitAxis(level.height, rows)
  const rects: PartRect[] = []

  let y = 0
  for (let row = 0; row < rows; row += 1) {
    let x = 0
    for (let column = 0; column < cols; column += 1) {
      rects.push({
        index: row * cols + column,
        x,
        y,
        width: widths[column],
        height: heights[row],
      })
      x += widths[column]
    }
    y += heights[row]
  }
  return rects
}

export function getPartIndex(level: PixelArtwork, cellIndex: number): number {
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= level.cells.length) return -1

  const { cols, rows } = normalizeParts(level)
  const column = axisPart(splitAxis(level.width, cols), cellIndex % level.width)
  const row = axisPart(splitAxis(level.height, rows), Math.floor(cellIndex / level.width))
  return row * cols + column
}
