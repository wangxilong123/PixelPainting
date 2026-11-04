import { describe, expect, it } from 'vitest'
import type { Level, LevelProgress } from '../models/level'
import { getLevels } from './levelService'
import { createEmptyProgress, getLevelAccuracy, getStars, isLevelUnlocked } from './progressService'

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

const completedAt = '2026-11-04T12:00:00.000Z'

function completedProgress(level: Level): LevelProgress {
  return { ...createEmptyProgress(level), painted: [...level.cells], completedAt, stars: 3 }
}

describe('progress rules', () => {
  it('creates an independent empty attempt with a default viewport', () => {
    const progress = createEmptyProgress(sample)
    expect(progress).toEqual({
      levelId: sample.id,
      painted: [0, 0, 0, 0, 0, 0],
      elapsedSeconds: 0,
      hintsUsed: 0,
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    })
    expect(createEmptyProgress(sample).painted).not.toBe(progress.painted)
  })

  it('only counts correct nonempty cells and handles a zero denominator', () => {
    const partial = { ...createEmptyProgress(sample), painted: [1, 1, 1, 0, 2, 2] }
    expect(getLevelAccuracy(sample, partial)).toBe(0.5)
    expect(getLevelAccuracy(sample, completedProgress(sample))).toBe(1)
    expect(getLevelAccuracy({ ...sample, cells: Array(6).fill(0) }, partial)).toBe(0)
  })

  it.each([[0, 3], [1, 2], [2, 2], [3, 1]])(
    'awards %i hints the expected completed rating of %i',
    (hintsUsed, stars) => {
      expect(getStars(sample, { ...completedProgress(sample), hintsUsed })).toBe(stars)
    },
  )

  it('returns one star for an unfinished attempt', () => {
    expect(getStars(sample, createEmptyProgress(sample))).toBe(1)
  })

  it('unlocks only levels whose predecessors are all complete', () => {
    const levels = getLevels()
    const [first, second, third] = levels
    const firstDone = { [first.id]: completedProgress(first) }
    const secondDone = { [second.id]: completedProgress(second) }

    expect(isLevelUnlocked(levels, {}, first.id)).toBe(true)
    expect(isLevelUnlocked(levels, {}, second.id)).toBe(false)
    expect(isLevelUnlocked(levels, firstDone, second.id)).toBe(true)
    expect(isLevelUnlocked(levels, secondDone, third.id)).toBe(false)
    expect(isLevelUnlocked(levels, { ...firstDone, ...secondDone }, third.id)).toBe(true)
    expect(isLevelUnlocked(levels, firstDone, 'unknown')).toBe(false)
    expect(isLevelUnlocked([], firstDone, first.id)).toBe(false)
  })

  it('keeps the next level unlocked during a replay', () => {
    const levels = getLevels()
    const [first, second] = levels
    const bestResult = { completedAt, stars: 3 as const, elapsedSeconds: 20, hintsUsed: 0 }
    const replay = { ...createEmptyProgress(first), bestResult }
    expect(isLevelUnlocked(levels, { [first.id]: replay }, second.id)).toBe(true)
    expect(isLevelUnlocked(levels, {
      [first.id]: { ...replay, bestResult: { ...bestResult, completedAt: 'invalid' } },
    }, second.id)).toBe(false)
  })
})
