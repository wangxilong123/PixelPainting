import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { presetArtworks } from '../data/artworks'
import type { Level, LevelProgress } from '../models/level'
import { getLevelById, getLevels } from './levelService'
import { createEmptyProgress, getLevelSummary, isLevelComplete, isLevelUnlocked } from './progressService'

const sample: Level = {
  id: 'test-level',
  title: '测试关卡',
  tags: [],
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
      source: 'level',
      painted: [0, 0, 0, 0, 0, 0],
      elapsedSeconds: 0,
      hintsUsed: 0,
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    })
    expect(createEmptyProgress(sample).painted).not.toBe(progress.painted)
    expect(createEmptyProgress(sample, 'artwork').source).toBe('artwork')
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

  it('does not let artwork progress unlock or count levels', () => {
    const levels = getLevels()
    const [artwork] = presetArtworks
    const doneArtwork = { ...createEmptyProgress(artwork, 'artwork'), painted: [...artwork.cells], completedAt }
    expect(isLevelUnlocked(levels, { [artwork.id]: doneArtwork }, levels[1].id)).toBe(false)
    expect(getLevelSummary({ [artwork.id]: doneArtwork })).toEqual({ total: levels.length, completed: 0 })
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

describe('local progress snapshots (v2)', () => {
  const key = 'pixel-painting:v2:progress'
  const [first, second] = getLevels()
  const empty = { currentId: null, records: {} }

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
    const snapshot = { currentId: first.id, records: { [first.id]: progress, [second.id]: done } }

    service.saveProgressSnapshot(snapshot)
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(snapshot)
    vi.resetModules()
    const reloaded = await import('./progressService')
    expect(reloaded.loadProgressSnapshot()).toEqual(snapshot)
  })

  it('round-trips artwork records with their source', async () => {
    const service = await import('./progressService')
    const [artwork] = presetArtworks
    const progress = { ...createEmptyProgress(artwork, 'artwork'), elapsedSeconds: 7 }
    service.saveProgressSnapshot({ currentId: artwork.id, records: { [artwork.id]: progress } })
    vi.resetModules()
    const reloaded = await import('./progressService')
    expect(reloaded.loadProgressSnapshot()).toEqual({ currentId: artwork.id, records: { [artwork.id]: progress } })
  })

  it.each(['{invalid', '[]', '{"currentId":null,"records":null}', '{"records":{}}'])(
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
        currentId: 'unknown',
        records: { [first.id]: invalid, [second.id]: healthy },
      }))
      expect(service.loadProgressSnapshot()).toEqual({
        currentId: null,
        records: { [second.id]: healthy },
      })
    },
  )

  it('keeps the save and the completion rules of an unchunked level unchanged', async () => {
    const service = await import('./progressService')
    const progress: LevelProgress = { ...createEmptyProgress(first), partIndex: 0 }
    service.saveProgressSnapshot({ currentId: first.id, records: { [first.id]: progress } })

    expect(createEmptyProgress(first)).not.toHaveProperty('partIndex')
    expect(service.loadProgressSnapshot()).toEqual({
      currentId: first.id,
      records: { [first.id]: progress },
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
      currentId: chunked.id,
      records: { [chunked.id]: { ...base, partIndex } },
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
      expect(JSON.parse(localStorage.getItem(key)!).records[first.id].elapsedSeconds).toBe(20)
    },
  )

  it('preserves the current work when only the progress map is saved', async () => {
    const service = await import('./progressService')
    service.saveProgressSnapshot({ currentId: first.id, records: {} })
    const records = { [first.id]: createEmptyProgress(first) }
    service.saveProgress(records)
    expect(service.loadProgressSnapshot()).toEqual({ currentId: first.id, records })
  })
})

describe('v1 to v2 migration', () => {
  const v1Key = 'pixel-painting:v1:progress'
  const v2Key = 'pixel-painting:v2:progress'
  const [first, second] = getLevels()

  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('moves a v1 save to the v2 key keeping progress, viewport and part index', async () => {
    const service = await import('./progressService')
    const chunked = getLevelById('level-008')
    if (!chunked) throw new Error('fixture level missing')
    const progress = {
      ...createEmptyProgress(first),
      elapsedSeconds: 19,
      hintsUsed: 2,
      viewport: { scale: 2, offsetX: -18, offsetY: 12 },
    }
    const index = first.cells.findIndex((color) => color !== 0)
    progress.painted[index] = first.cells[index]
    const chunkedProgress = {
      ...createEmptyProgress(chunked),
      partIndex: 4,
      viewport: { scale: 0.65, offsetX: 4, offsetY: -2 },
    }
    const legacy = {
      currentLevelId: first.id,
      levels: { [first.id]: progress, [chunked.id]: chunkedProgress, [second.id]: completedProgress(second) },
    }
    localStorage.setItem(v1Key, JSON.stringify(legacy))

    const snapshot = service.loadProgressSnapshot()
    expect(snapshot.currentId).toBe(first.id)
    expect(snapshot.records[first.id]).toEqual({ ...progress, source: 'level' })
    expect(snapshot.records[chunked.id]).toEqual({ ...chunkedProgress, source: 'level' })
    expect(snapshot.records[second.id]).toEqual({ ...completedProgress(second), source: 'level' })
    expect(JSON.parse(localStorage.getItem(v2Key)!)).toEqual(snapshot)
    expect(JSON.parse(localStorage.getItem(v1Key)!)).toEqual(legacy)
  })

  it('drops the star rating left over in a v1 save', async () => {
    const service = await import('./progressService')
    const expected: LevelProgress = {
      ...completedProgress(first),
      hintsUsed: 2,
      bestResult: { completedAt, elapsedSeconds: 20, hintsUsed: 2 },
    }
    localStorage.setItem(v1Key, JSON.stringify({
      currentLevelId: null,
      levels: { [first.id]: { ...expected, stars: 3 } },
    }))
    const loaded = service.loadProgress()[first.id]
    expect(loaded).toEqual({ ...expected, source: 'level' })
    expect(loaded).not.toHaveProperty('stars')
  })

  it('never lets a v1 save overwrite existing v2 data', async () => {
    const service = await import('./progressService')
    const legacyRecord = { ...createEmptyProgress(first), elapsedSeconds: 5 }
    const currentRecord = { ...createEmptyProgress(first), elapsedSeconds: 9 }
    localStorage.setItem(v1Key, JSON.stringify({ currentLevelId: first.id, levels: { [first.id]: legacyRecord } }))
    localStorage.setItem(v2Key, JSON.stringify({ currentId: first.id, records: { [first.id]: currentRecord } }))

    expect(service.loadProgress()[first.id]).toEqual(currentRecord)
    expect(JSON.parse(localStorage.getItem(v2Key)!).records[first.id].elapsedSeconds).toBe(9)
  })

  it('still moves pre-rename level ids while migrating', async () => {
    const service = await import('./progressService')
    const donut = getLevelById('level-004')
    const rocket = getLevelById('level-005')
    if (!donut || !rocket) throw new Error('fixture levels missing')
    localStorage.setItem(v1Key, JSON.stringify({
      currentLevelId: 'level-009',
      levels: {
        'level-005': { ...completedProgress(donut), levelId: 'level-005' },
        'level-009': { ...completedProgress(rocket), levelId: 'level-009' },
      },
    }))

    const snapshot = service.loadProgressSnapshot()
    expect(snapshot.currentId).toBe('level-005')
    expect(Object.keys(snapshot.records).sort()).toEqual(['level-004', 'level-005'])
    expect(isLevelComplete(donut, snapshot.records['level-004'])).toBe(true)
    expect(isLevelComplete(rocket, snapshot.records['level-005'])).toBe(true)
  })

  it('returns an empty snapshot when neither version exists', async () => {
    const service = await import('./progressService')
    expect(service.loadProgressSnapshot()).toEqual({ currentId: null, records: {} })
    expect(localStorage.getItem(v2Key)).toBeNull()
  })
})
