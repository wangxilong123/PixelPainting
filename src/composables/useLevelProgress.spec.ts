import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Level } from '../models/level'
import { getLevels } from '../services/levelService'

const [first, second] = getLevels()
const startTime = '2026-11-04T12:00:00.000Z'
const finishTime = '2026-11-04T12:00:19.000Z'
const viewport = { scale: 2, offsetX: -18, offsetY: 12 }

function firstTarget(level: Level): [number, number] {
  const index = level.cells.findIndex((color) => color !== 0)
  return [index, level.cells[index]]
}

type Session = ReturnType<typeof import('./useLevelProgress').useLevelProgress>

async function session(): Promise<Session> {
  const { useLevelProgress } = await import('./useLevelProgress')
  return useLevelProgress()
}

function finishLevel(progress: Session, level: Level): void {
  for (const [index, color] of level.cells.entries()) {
    if (color !== 0) progress.paintCell(index, color)
  }
}

function paintedCount(progress: Session): number {
  return progress.currentProgress.value?.painted.filter((color) => color !== 0).length ?? 0
}

describe('useLevelProgress', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(startTime))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('opens the first level and rejects unknown or locked levels', async () => {
    const progress = await session()
    expect(progress.currentLevelId.value).toBeNull()
    expect(progress.getNextLevelId()).toBeUndefined()
    expect(progress.openLevel(first.id)).toBe(true)
    expect(progress.currentProgress.value?.startedAt).toBe(startTime)
    expect(progress.openLevel('unknown')).toBe(false)
    expect(progress.openLevel(second.id)).toBe(false)
    expect(progress.currentLevelId.value).toBe(first.id)
    expect(progress.getNextLevelId()).toBeUndefined()
  })

  it('changes progress only for a correct paint on an unfilled interactive cell', async () => {
    const progress = await session()
    progress.openLevel(first.id)
    const [index, color] = firstTarget(first)
    const emptyIndex = first.cells.indexOf(0)
    const before = progress.currentProgress.value

    expect(progress.paintCell(emptyIndex, color)).toBe('ignored')
    expect(progress.paintCell(-1, color)).toBe('ignored')
    expect(progress.paintCell(first.cells.length, color)).toBe('ignored')
    expect(progress.paintCell(index + 0.5, color)).toBe('ignored')
    expect(progress.paintCell(index, 99)).toBe('incorrect')
    expect(progress.currentProgress.value).toBe(before)
    expect(paintedCount(progress)).toBe(0)

    expect(progress.paintCell(index, color)).toBe('painted')
    expect(progress.currentProgress.value?.painted[index]).toBe(color)
    expect(paintedCount(progress)).toBe(1)
    expect(progress.paintCell(index, color)).toBe('ignored')
    expect(paintedCount(progress)).toBe(1)
  })

  it('returns a hint without filling a cell and stops offering hints after completion', async () => {
    const progress = await session()
    progress.openLevel(first.id)
    const [index, color] = firstTarget(first)
    const painted = progress.currentProgress.value?.painted
    expect(progress.recordHint()).toBe(index)
    expect(progress.currentProgress.value?.hintsUsed).toBe(1)
    expect(progress.currentProgress.value?.painted).toEqual(painted)
    progress.paintCell(index, color)
    expect(progress.recordHint()).toBeGreaterThan(index)
    finishLevel(progress, first)
    expect(progress.recordHint()).toBeUndefined()
    expect(progress.currentProgress.value?.hintsUsed).toBe(2)
  })

  it('restores in-progress painting, hints, elapsed time and viewport after reload', async () => {
    const progress = await session()
    progress.openLevel(first.id)
    progress.paintCell(...firstTarget(first))
    progress.recordHint()
    progress.setElapsedSeconds(19)
    progress.setElapsedSeconds(10)
    progress.setElapsedSeconds(-1)
    const input = { ...viewport }
    progress.setViewport(input)
    input.scale = 5
    progress.setViewport({ ...viewport, scale: 0 })
    progress.setViewport({ ...viewport, offsetX: Infinity })
    expect(progress.currentProgress.value?.elapsedSeconds).toBe(19)
    expect(progress.currentProgress.value?.viewport).toEqual(viewport)

    vi.resetModules()
    const restored = await session()
    expect(restored.currentLevelId.value).toBe(first.id)
    expect(restored.currentProgress.value).toEqual(progress.currentProgress.value)
  })

  it('settles the last cell once and immediately unlocks the next level', async () => {
    const progress = await session()
    progress.openLevel(first.id)
    progress.recordHint()
    progress.setElapsedSeconds(19)
    vi.setSystemTime(new Date(finishTime))
    finishLevel(progress, first)

    const done = progress.currentProgress.value
    expect(done).toMatchObject({
      completedAt: finishTime,
      stars: 2,
      bestResult: { completedAt: finishTime, stars: 2, elapsedSeconds: 19, hintsUsed: 1 },
    })
    const { loadProgress } = await import('../services/progressService')
    expect(loadProgress()[first.id]).toEqual(done)
    expect(progress.getNextLevelId()).toBe(second.id)
    expect(progress.paintCell(...firstTarget(first))).toBe('ignored')
    progress.setElapsedSeconds(25)
    expect(progress.currentProgress.value).toBe(done)
    expect(progress.openLevel(second.id)).toBe(true)
    finishLevel(progress, second)
    for (const level of getLevels().slice(2)) {
      expect(progress.openLevel(level.id)).toBe(true)
      finishLevel(progress, level)
    }
    expect(progress.getNextLevelId()).toBeUndefined()
  })

  it('clears the current attempt while preserving the best result and unlocks', async () => {
    const progress = await session()
    progress.openLevel(first.id)
    progress.setElapsedSeconds(19)
    progress.setViewport(viewport)
    finishLevel(progress, first)
    const best = progress.currentProgress.value?.bestResult

    vi.setSystemTime(new Date(finishTime))
    progress.restartLevel()
    expect(progress.currentProgress.value).toEqual({
      levelId: first.id,
      painted: first.cells.map(() => 0),
      elapsedSeconds: 0,
      hintsUsed: 0,
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
      startedAt: finishTime,
      bestResult: best,
    })
    expect(progress.getNextLevelId()).toBe(second.id)
    progress.recordHint()
    progress.setElapsedSeconds(10)
    finishLevel(progress, first)
    expect(progress.currentProgress.value?.stars).toBe(2)
    expect(progress.currentProgress.value?.bestResult).toEqual(best)

    progress.restartLevel()
    progress.setElapsedSeconds(15)
    finishLevel(progress, first)
    expect(progress.currentProgress.value?.bestResult?.elapsedSeconds).toBe(15)
  })

  it('keeps the result of a restored completed attempt that has no best result yet', async () => {
    const { createEmptyProgress, saveProgressSnapshot } = await import('../services/progressService')
    saveProgressSnapshot({
      currentLevelId: first.id,
      levels: {
        [first.id]: {
          ...createEmptyProgress(first),
          painted: [...first.cells],
          completedAt: finishTime,
          elapsedSeconds: 19,
          stars: 3,
        },
      },
    })
    const progress = await session()
    progress.restartLevel()
    expect(progress.currentProgress.value?.bestResult).toEqual({
      completedAt: finishTime, stars: 3, elapsedSeconds: 19, hintsUsed: 0,
    })
    expect(progress.getNextLevelId()).toBe(second.id)
  })

  it('exposes per-level records without leaking internal state', async () => {
    const progress = await session()
    expect(progress.levelRecords.value).toEqual({})
    progress.openLevel(first.id)
    expect(progress.levelRecords.value[first.id]?.levelId).toBe(first.id)
    expect(progress.levelRecords.value[second.id]).toBeUndefined()

    const records = progress.levelRecords.value
    delete records[first.id]
    progress.setElapsedSeconds(5)
    expect(progress.levelRecords.value[first.id]?.elapsedSeconds).toBe(5)
  })

  it('reverts a painted cell and rejects invalid revert targets', async () => {
    const progress = await session()
    progress.openLevel(first.id)
    const [index, color] = firstTarget(first)
    const otherIndex = first.cells.findIndex((c, i) => c !== 0 && i !== index)
    progress.paintCell(index, color)
    expect(paintedCount(progress)).toBe(1)

    expect(progress.revertCell(-1)).toBe(false)
    expect(progress.revertCell(first.cells.length)).toBe(false)
    expect(progress.revertCell(index + 0.5)).toBe(false)
    expect(progress.revertCell(first.cells.indexOf(0))).toBe(false)
    expect(progress.revertCell(otherIndex)).toBe(false)
    expect(progress.currentProgress.value?.painted[index]).toBe(color)

    expect(progress.revertCell(index)).toBe(true)
    expect(progress.currentProgress.value?.painted[index]).toBe(0)
    expect(paintedCount(progress)).toBe(0)
    expect(progress.paintCell(index, color)).toBe('painted')
    expect(paintedCount(progress)).toBe(1)

    finishLevel(progress, first)
    expect(progress.revertCell(index)).toBe(false)
    expect(progress.currentProgress.value?.painted[index]).toBe(color)
  })

  it('repaints a reverted cell and rejects invalid repaint targets', async () => {
    const progress = await session()
    progress.openLevel(first.id)
    const [index, color] = firstTarget(first)
    progress.paintCell(index, color)
    progress.revertCell(index)

    expect(progress.repaintCell(-1, color)).toBe(false)
    expect(progress.repaintCell(first.cells.length, color)).toBe(false)
    expect(progress.repaintCell(index + 0.5, color)).toBe(false)
    expect(progress.repaintCell(first.cells.indexOf(0), color)).toBe(false)
    expect(progress.repaintCell(index, 99)).toBe(false)
    expect(progress.currentProgress.value?.painted[index]).toBe(0)

    expect(progress.repaintCell(index, color)).toBe(true)
    expect(progress.currentProgress.value?.painted[index]).toBe(color)
    expect(progress.repaintCell(index, color)).toBe(false)

    finishLevel(progress, first)
    progress.restartLevel()
    expect(progress.repaintCell(index, color)).toBe(true)
    finishLevel(progress, first)
    expect(progress.repaintCell(index, color)).toBe(false)
  })

  it('settles through repaintCell and keeps the better historical best result', async () => {
    const progress = await session()
    progress.openLevel(first.id)
    finishLevel(progress, first)
    const best = progress.currentProgress.value?.bestResult
    expect(best).toMatchObject({ stars: 3, elapsedSeconds: 0, hintsUsed: 0 })

    progress.restartLevel()
    progress.recordHint()
    const targets = first.cells.flatMap((color, index) => (color === 0 ? [] : [[index, color]]))
    const [[xIndex, xColor], [yIndex, yColor]] = targets
    progress.paintCell(xIndex, xColor)
    for (const [index, color] of targets) {
      if (index !== xIndex && index !== yIndex) progress.paintCell(index, color)
    }
    expect(progress.revertCell(xIndex)).toBe(true)
    expect(progress.paintCell(yIndex, yColor)).toBe('painted')
    expect(progress.currentProgress.value?.completedAt).toBeUndefined()

    vi.setSystemTime(new Date(finishTime))
    expect(progress.repaintCell(xIndex, xColor)).toBe(true)
    expect(progress.currentProgress.value).toMatchObject({ completedAt: finishTime, stars: 2 })
    expect(progress.currentProgress.value?.bestResult).toEqual(best)
  })

  it('shares progress across composable instances even when storage writes fail', async () => {
    const firstSession = await session()
    const secondSession = await session()
    firstSession.openLevel(first.id)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    firstSession.paintCell(...firstTarget(first))
    secondSession.setElapsedSeconds(19)
    expect(firstSession.currentProgress.value?.elapsedSeconds).toBe(19)
    expect(paintedCount(secondSession)).toBe(1)
    const { loadProgress } = await import('../services/progressService')
    expect(loadProgress()[first.id]).toEqual(firstSession.currentProgress.value)
  })
})
