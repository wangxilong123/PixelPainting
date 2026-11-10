import { describe, expect, it } from 'vitest'
import type { Level, LevelParts } from '../models/level'
import {
  getCategories,
  getInteractiveCellCount,
  getLevelById,
  getLevels,
  getPartIndex,
  getPartRects,
  normalizeParts,
  sortLevels,
  validateLevel,
} from './levelService'

const sample: Level = {
  id: 'test-level',
  title: '测试关卡',
  category: 'animal',
  difficulty: 1,
  width: 3,
  height: 2,
  palette: [
    { id: 1, hex: '#F4A261', name: '橘色' },
    { id: 2, hex: '#45312F', name: '深棕' },
  ],
  cells: [0, 1, 2, 1, 0, 2],
}

describe('validateLevel', () => {
  it('accepts a valid level', () => {
    expect(() => validateLevel(sample)).not.toThrow()
  })

  it.each([{ width: 0 }, { height: 1.5 }, { width: -1 }])(
    'rejects invalid dimensions %j',
    (dimensions) => {
      expect(() => validateLevel({ ...sample, ...dimensions })).toThrow(
        /test-level.*width and height/,
      )
    },
  )

  it.each([
    { cells: [0, 1, 2, 1, 0] },
    { cells: [0, 1, 2, 1, 0, 2, 1] },
  ])('rejects an incorrect cell count %j', ({ cells }) => {
    expect(() => validateLevel({ ...sample, cells })).toThrow(/test-level.*cells\.length/)
  })

  it('rejects duplicate palette IDs', () => {
    const palette = [...sample.palette, { id: 1, hex: '#FFFFFF', name: '白色' }]

    expect(() => validateLevel({ ...sample, palette })).toThrow(
      /test-level.*duplicate palette ID 1/,
    )
  })

  it('reserves color ID zero for empty cells', () => {
    const palette = [...sample.palette, { id: 0, hex: '#FFFFFF', name: '白色' }]

    expect(() => validateLevel({ ...sample, palette })).toThrow(
      /test-level.*invalid palette ID 0/,
    )
  })

  it('identifies the index and color ID of an invalid cell', () => {
    const cells = [0, 1, 3, 1, 0, 2]

    expect(() => validateLevel({ ...sample, cells })).toThrow(
      /test-level.*cells\[2\].*unknown color ID 3/,
    )
  })

  it('rejects levels without interactive cells', () => {
    const cells = [0, 0, 0, 0, 0, 0]

    expect(() => validateLevel({ ...sample, cells })).toThrow(
      /test-level.*no interactive cells/,
    )
  })
})

describe('getInteractiveCellCount', () => {
  it('excludes empty cells', () => {
    expect(getInteractiveCellCount(sample)).toBe(4)
  })
})

describe('level parts', () => {
  function grid(width: number, height: number, parts?: LevelParts): Level {
    return {
      ...sample,
      id: 'grid',
      width,
      height,
      cells: Array<number>(width * height).fill(1),
      parts,
    }
  }

  it.each([
    undefined,
    { cols: 1, rows: 1 },
    { cols: 2, rows: 3 },
    { cols: 4, rows: 4 },
    { cols: 0, rows: 0 },
    { cols: 2.5, rows: 2.5 },
    { cols: -3, rows: -3 },
    { cols: Number.NaN, rows: Number.NaN },
  ])('falls back to a single part for %j', (parts) => {
    const level = { ...sample, parts }

    expect(normalizeParts(level)).toEqual({ cols: 1, rows: 1 })
    expect(getPartRects(level)).toEqual([{ index: 0, x: 0, y: 0, width: 3, height: 2 }])
  })

  it.each([{ cols: 2, rows: 2 }, { cols: 3, rows: 3 }])('keeps an accepted %j split', (parts) => {
    expect(normalizeParts({ ...sample, parts })).toEqual(parts)
    expect(getPartRects({ ...sample, parts })).toHaveLength(parts.cols * parts.rows)
  })

  it('returns the whole level as one rect when it is not chunked', () => {
    expect(getPartRects(sample)).toEqual([{ index: 0, x: 0, y: 0, width: 3, height: 2 }])
    expect(getPartIndex(sample, 0)).toBe(0)
    expect(getPartIndex(sample, 5)).toBe(0)
  })

  it.each([{ cols: 2, rows: 2 }, { cols: 3, rows: 3 }])(
    'tiles $cols×$cols rects over the level with no overlap and no gap',
    (parts) => {
      const level = grid(32, 27, parts)
      const rects = getPartRects(level)
      const covered = new Set<number>()

      expect(rects).toHaveLength(parts.cols * parts.cols)
      expect(rects.map((rect) => rect.index)).toEqual(rects.map((_, index) => index))
      for (const rect of rects) {
        expect(rect.width).toBeGreaterThan(0)
        expect(rect.height).toBeGreaterThan(0)
        for (let row = rect.y; row < rect.y + rect.height; row += 1) {
          for (let column = rect.x; column < rect.x + rect.width; column += 1) {
            const cell = row * level.width + column
            expect(covered.has(cell)).toBe(false)
            covered.add(cell)
          }
        }
      }
      expect(covered.size).toBe(32 * 27)
    },
  )

  it('gives the remainder to the leading parts so 32 splits into 11, 11 and 10', () => {
    const rects = getPartRects(grid(32, 32, { cols: 3, rows: 3 }))
    const firstRow = rects.slice(0, 3)
    const firstColumn = rects.filter((_, index) => index % 3 === 0)

    expect(firstRow.map((rect) => rect.width)).toEqual([11, 11, 10])
    expect(firstRow.map((rect) => rect.x)).toEqual([0, 11, 22])
    expect(firstColumn.map((rect) => rect.height)).toEqual([11, 11, 10])
    expect(firstColumn.map((rect) => rect.y)).toEqual([0, 11, 22])
  })

  it.each([{ cols: 2, rows: 2 }, { cols: 3, rows: 3 }])(
    'keeps neighbouring part sizes of a $cols×$cols split within one cell',
    (parts) => {
      const level = grid(31, 29, parts)
      const rects = getPartRects(level)
      const widths = rects.filter((rect) => rect.y === 0).map((rect) => rect.width)
      const heights = rects.filter((rect) => rect.x === 0).map((rect) => rect.height)

      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1)
      expect(widths.reduce((total, width) => total + width, 0)).toBe(31)
      expect(heights.reduce((total, height) => total + height, 0)).toBe(29)
    },
  )

  it('splits an odd 5×5 grid into 3, 3, 2 columns and rows', () => {
    const level = grid(5, 5, { cols: 2, rows: 2 })

    expect(getPartRects(level)).toEqual([
      { index: 0, x: 0, y: 0, width: 3, height: 3 },
      { index: 1, x: 3, y: 0, width: 2, height: 3 },
      { index: 2, x: 0, y: 3, width: 3, height: 2 },
      { index: 3, x: 3, y: 3, width: 2, height: 2 },
    ])
  })

  it('assigns the boundary cells of a 2×2 split to exactly one part', () => {
    const level = grid(5, 5, { cols: 2, rows: 2 })
    const at = (column: number, row: number) => getPartIndex(level, row * 5 + column)

    expect(at(2, 0)).toBe(0)
    expect(at(3, 0)).toBe(1)
    expect(at(4, 2)).toBe(1)
    expect(at(0, 3)).toBe(2)
    expect(at(2, 2)).toBe(0)
    expect(at(3, 3)).toBe(3)
    expect(at(4, 4)).toBe(3)
  })

  it('agrees with the rect of every part on a 32×27 grid split into 3×3', () => {
    const level = grid(32, 27, { cols: 3, rows: 3 })
    const rects = getPartRects(level)

    for (const [cellIndex] of level.cells.entries()) {
      const rect = rects[getPartIndex(level, cellIndex)]
      const column = cellIndex % level.width
      const row = Math.floor(cellIndex / level.width)

      expect(column).toBeGreaterThanOrEqual(rect.x)
      expect(column).toBeLessThan(rect.x + rect.width)
      expect(row).toBeGreaterThanOrEqual(rect.y)
      expect(row).toBeLessThan(rect.y + rect.height)
    }
  })

  it('reports cell indexes outside the grid as belonging to no part', () => {
    expect(getPartIndex(grid(5, 5, { cols: 2, rows: 2 }), -1)).toBe(-1)
    expect(getPartIndex(grid(5, 5, { cols: 2, rows: 2 }), 25)).toBe(-1)
    expect(getPartIndex(grid(5, 5, { cols: 2, rows: 2 }), 2.5)).toBe(-1)
    expect(getPartIndex(grid(5, 5, { cols: 2, rows: 2 }), Number.NaN)).toBe(-1)
  })

  it('accepts a chunked level through the regular validation', () => {
    expect(() => validateLevel(grid(8, 8, { cols: 3, rows: 3 }))).not.toThrow()
    expect(() => validateLevel(grid(8, 8, { cols: 9, rows: 9 }))).not.toThrow()
  })
})

describe('preset levels', () => {
  it('lists every preset level in unlock order', () => {
    const levels = getLevels()
    const ids = levels.map((level) => level.id)
    const orders = levels.map((level) => level.order ?? Number.POSITIVE_INFINITY)

    expect(ids.length).toBeGreaterThan(0)
    expect(ids[0]).toBe('level-001')
    // 关卡 ID 同时是文件名和存档键：编号必须连续且等于游玩顺序，不留空号
    ids.forEach((id, index) => expect(id).toBe(`level-${String(index + 1).padStart(3, '0')}`))
    expect(new Set(ids).size).toBe(levels.length)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
    for (const level of levels) {
      expect(() => validateLevel(level)).not.toThrow()
    }
  })

  it('lists only the categories that have levels, in registry order', () => {
    expect(getCategories()).toEqual([
      { id: 'animal', label: '动物' },
      { id: 'food', label: '食物' },
      { id: 'tech', label: '科技' },
      { id: 'other', label: '其他' },
    ])
  })

  it('finds a level by its exact ID', () => {
    expect(getLevelById('level-002')?.title).toBe('红苹果')
    expect(getLevelById('missing')).toBeUndefined()
  })

  it('keeps the catalog order when a caller reorders the returned list', () => {
    getLevels().reverse()

    expect(getLevels()[0]?.id).toBe('level-001')
  })

  it('sorts by explicit order and leaves unordered levels in registration order', () => {
    const unorderedFirst = { ...sample, id: 'a' }
    const orderedSecond = { ...sample, id: 'b', order: 2 }
    const orderedFirst = { ...sample, id: 'c', order: 1 }
    const unorderedLast = { ...sample, id: 'd' }

    expect(sortLevels([unorderedFirst, orderedSecond, orderedFirst, unorderedLast])
      .map((level) => level.id)).toEqual(['c', 'b', 'a', 'd'])
  })
})
