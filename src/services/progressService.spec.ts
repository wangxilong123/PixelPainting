import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Level, LevelProgress } from '../models/level'
import { getLevels } from './levelService'
import { createEmptyProgress, getLevelSummary, isLevelComplete, isLevelUnlocked } from './progressService'

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
  return { ...createEmptyProgress(level), painted: [...level.cells], completedAt }
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

  it('completes only when every interactive cell is painted', () => {
    const partial = { ...createEmptyProgress(sample), painted: [1, 1, 1, 0, 2, 2] }
    expect(isLevelComplete(sample, partial)).toBe(false)
    expect(isLevelComplete(sample, completedProgress(sample))).toBe(true)
    expect(isLevelComplete({ ...sample, cells: Array(6).fill(0) }, partial)).toBe(false)
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
    const bestResult = { completedAt, elapsedSeconds: 20, hintsUsed: 0 }
    const replay = { ...createEmptyProgress(first), bestResult }
    expect(isLevelUnlocked(levels, { [first.id]: replay }, second.id)).toBe(true)
    expect(isLevelUnlocked(levels, {
      [first.id]: { ...replay, bestResult: { ...bestResult, completedAt: 'invalid' } },
    }, second.id)).toBe(false)
  })
})

describe('getLevelSummary', () => {
  it('counts cleared levels', () => {
    const levels = getLevels()
    const [first] = levels
    const total = levels.length

    expect(getLevelSummary({})).toEqual({ total, completed: 0 })
    expect(getLevelSummary({ [first.id]: { ...completedProgress(first), hintsUsed: 0 } }))
      .toEqual({ total, completed: 1 })
  })

  it('keeps a replayed level counted through its best result', () => {
    const levels = getLevels()
    const [first, second] = levels
    const replay: LevelProgress = {
      ...createEmptyProgress(first),
      bestResult: { completedAt, elapsedSeconds: 19, hintsUsed: 1 },
    }

    expect(getLevelSummary({ [first.id]: replay })).toEqual({ total: levels.length, completed: 1 })
    expect(isLevelUnlocked(levels, { [first.id]: replay }, second.id)).toBe(true)
  })
})

describe('local progress snapshots', () => {
  const key = 'pixel-painting:v1:progress'
  const [first, second] = getLevels()
  const empty = { currentLevelId: null, levels: {} }

  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes the versioned key and restores a snapshot from disk after reloading', async () => {
    const service = await import('./progressService')
    const progress = {
      ...createEmptyProgress(first),
      elapsedSeconds: 19,
      hintsUsed: 2,
      viewport: { scale: 2, offsetX: -18, offsetY: 12 },
    }
    const index = first.cells.findIndex((color) => color !== 0)
    progress.painted[index] = first.cells[index]
    const done = {
      ...completedProgress(second),
      bestResult: { completedAt, elapsedSeconds: 0, hintsUsed: 0 },
    }
    const snapshot = { currentLevelId: first.id, levels: { [first.id]: progress, [second.id]: done } }

    service.saveProgressSnapshot(snapshot)
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(snapshot)
    vi.resetModules()
    const reloaded = await import('./progressService')
    expect(reloaded.loadProgressSnapshot()).toEqual(snapshot)
  })

  it.each(['{invalid', '[]', '{"currentLevelId":null,"levels":null}', '{"levels":{}}'])(
    'ignores invalid snapshots %s',
    async (raw) => {
      const service = await import('./progressService')
      localStorage.setItem(key, raw)
      expect(service.loadProgressSnapshot()).toEqual(empty)
    },
  )

  it.each(['length', 'color', 'viewport', 'completion', 'missing completion'] as const)(
    'keeps healthy records when another record has invalid %s',
    async (field) => {
      const service = await import('./progressService')
      const healthy = createEmptyProgress(second)
      const invalid = createEmptyProgress(first)
      if (field === 'length') invalid.painted.pop()
      if (field === 'color') invalid.painted[0] = 99
      if (field === 'viewport') invalid.viewport = { scale: 0, offsetX: 0, offsetY: 0 }
      if (field === 'completion') invalid.completedAt = completedAt
      if (field === 'missing completion') invalid.painted = [...first.cells]

      localStorage.setItem(key, JSON.stringify({
        currentLevelId: 'unknown',
        levels: { [first.id]: invalid, [second.id]: healthy },
      }))
      expect(service.loadProgressSnapshot()).toEqual({
        currentLevelId: null,
        levels: { [second.id]: healthy },
      })
    },
  )

  it('ignores the star rating left over in an older save', async () => {
    const service = await import('./progressService')
    const expected: LevelProgress = {
      ...completedProgress(first),
      hintsUsed: 2,
      bestResult: { completedAt, elapsedSeconds: 20, hintsUsed: 2 },
    }
    localStorage.setItem(key, JSON.stringify({
      currentLevelId: null,
      levels: { [first.id]: { ...expected, stars: 3 } },
    }))
    expect(service.loadProgress()[first.id]).toEqual(expected)
  })

  it('keeps the save and the completion rules of an unchunked level unchanged', async () => {
    const service = await import('./progressService')
    const progress: LevelProgress = { ...createEmptyProgress(first), partIndex: 0 }
    service.saveProgressSnapshot({ currentLevelId: first.id, levels: { [first.id]: progress } })

    expect(createEmptyProgress(first)).not.toHaveProperty('partIndex')
    expect(service.loadProgressSnapshot()).toEqual({
      currentLevelId: first.id,
      levels: { [first.id]: progress },
    })
    expect(isLevelComplete(first, progress)).toBe(false)
    expect(isLevelComplete(first, completedProgress(first))).toBe(true)
  })

  it('drops a part index that no longer fits without touching the painted cells', async () => {
    const chunked: Level = { ...first, id: 'chunked-level', parts: { cols: 3, rows: 3 } }
    vi.doMock('./levelService', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./levelService')>()
      return {
        ...actual,
        getLevelById: (id: string) => (id === chunked.id ? chunked : actual.getLevelById(id)),
      }
    })
    const service = await import('./progressService')
    const base: LevelProgress = { ...createEmptyProgress(chunked), startedAt: completedAt }
    const index = chunked.cells.findIndex((color) => color !== 0)
    base.painted[index] = chunked.cells[index]
    const write = (partIndex: number) => localStorage.setItem(key, JSON.stringify({
      currentLevelId: chunked.id,
      levels: { [chunked.id]: { ...base, partIndex } },
    }))

    write(4)
    expect(service.loadProgress()[chunked.id]).toEqual({ ...base, partIndex: 4 })
    write(9)
    expect(service.loadProgress()[chunked.id]).toEqual(base)
    write(-1)
    expect(service.loadProgress()[chunked.id]).toEqual(base)
    vi.doUnmock('./levelService')
  })

  it.each(['access', 'read', 'write'] as const)(
    'retains the latest progress when storage %s fails',
    async (failure) => {
      const service = await import('./progressService')
      const progress = createEmptyProgress(first)
      service.saveProgress({ [first.id]: progress })
      const updated = { ...progress, elapsedSeconds: 19 }

      if (failure === 'access') {
        vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked') })
      } else {
        const method = failure === 'read' ? 'getItem' : 'setItem'
        vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error('blocked') })
      }
      service.saveProgress({ [first.id]: updated })
      expect(service.loadProgress()).toEqual({ [first.id]: updated })
      vi.restoreAllMocks()
      expect(service.loadProgress()).toEqual({ [first.id]: updated })
      service.saveProgress({ [first.id]: { ...updated, elapsedSeconds: 20 } })
      expect(JSON.parse(localStorage.getItem(key)!).levels[first.id].elapsedSeconds).toBe(20)
    },
  )

  it('preserves the current level when only the progress map is saved', async () => {
    const service = await import('./progressService')
    service.saveProgressSnapshot({ currentLevelId: first.id, levels: {} })
    const levels = { [first.id]: createEmptyProgress(first) }
    service.saveProgress(levels)
    expect(service.loadProgressSnapshot()).toEqual({ currentLevelId: first.id, levels })
  })
})
