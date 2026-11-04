import { describe, expect, it } from 'vitest'
import type { Level } from '../models/level'
import {
  getInteractiveCellCount,
  getLevelById,
  getLevels,
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

describe('preset levels', () => {
  it('lists three valid levels in unlock order', () => {
    const levels = getLevels()
    const ids = levels.map((level) => level.id)

    expect(ids).toEqual(['level-001', 'level-002', 'level-003'])
    expect(new Set(ids).size).toBe(levels.length)
    expect(levels.map((level) => level.category)).toEqual(['animal', 'food', 'plant'])
    expect(levels.map(getInteractiveCellCount)).toEqual([38, 39, 25])
    for (const level of levels) {
      expect(() => validateLevel(level)).not.toThrow()
    }
  })

  it('finds a level by its exact ID', () => {
    expect(getLevelById('level-002')?.title).toBe('红苹果')
    expect(getLevelById('missing')).toBeUndefined()
  })

  it('keeps the catalog order when a caller reorders the returned list', () => {
    getLevels().reverse()

    expect(getLevels()[0]?.id).toBe('level-001')
  })
})
