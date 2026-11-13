import { describe, expect, it } from 'vitest'
import type { PixelArtwork } from '../models/artwork'
import type { LevelProgress, ProgressSource } from '../models/level'
import { getLevels } from './levelService'
import { createEmptyProgress } from './progressService'
import { getPortfolio, getPlayerStats } from './statsService'

const older = '2026-11-10T09:00:00.000Z'
const newer = '2026-11-12T18:30:00.000Z'

function makeArtwork(id: string, title: string, cells: number[]): PixelArtwork {
  return {
    id,
    title,
    tags: [],
    width: cells.length,
    height: 1,
    palette: [
      { id: 1, hex: '#F4A261', name: '橘' },
      { id: 2, hex: '#2A9D8F', name: '青' },
    ],
    cells,
  }
}

function attempt(
  artwork: PixelArtwork,
  painted: number[],
  options: { source?: ProgressSource; completedAt?: string; bestAt?: string } = {},
): LevelProgress {
  const progress: LevelProgress = {
    ...createEmptyProgress(artwork, options.source ?? 'artwork'),
    painted,
  }
  if (options.completedAt !== undefined) progress.completedAt = options.completedAt
  if (options.bestAt !== undefined) {
    progress.bestResult = { completedAt: options.bestAt, elapsedSeconds: 12, hintsUsed: 0 }
  }
  return progress
}

const cat = makeArtwork('art-a', '橘猫', [1, 1, 0, 2])
const fox = makeArtwork('art-b', '小狐狸', [2, 0, 2, 2, 1])

describe('getPlayerStats', () => {
  it('returns zeros instead of NaN for an empty save', () => {
    const stats = getPlayerStats({}, [cat, fox])
    expect(stats).toEqual({ completedWorks: 0, paintedPixels: 0, totalLevels: getLevels().length })
    expect(getPlayerStats({}, [])).toEqual({
      completedWorks: 0,
      paintedPixels: 0,
      totalLevels: getLevels().length,
    })
  })

  it('counts completed works and accumulates painted interactive cells across sources', () => {
    const records = {
      [cat.id]: attempt(cat, [1, 1, 0, 2], { source: 'artwork', completedAt: older }),
      [fox.id]: attempt(fox, [2, 0, 0, 0, 0], { source: 'user' }),
    }
    expect(getPlayerStats(records, [cat, fox])).toEqual({
      completedWorks: 1,
      paintedPixels: 4,
      totalLevels: getLevels().length,
    })
  })

  it('ignores empty cells, unknown ids and records pointing at another work', () => {
    const stray = { ...attempt(cat, [1, 1, 1, 1], { completedAt: older }), levelId: 'art-other' }
    const records = {
      'art-unknown': attempt(cat, [1, 1, 1, 1], { completedAt: older }),
      [cat.id]: stray,
      [fox.id]: attempt(fox, [0, 0, 0, 0, 0]),
    }
    expect(getPlayerStats(records, [cat, fox])).toEqual({
      completedWorks: 0,
      paintedPixels: 0,
      totalLevels: getLevels().length,
    })
  })

  it('keeps a replayed work counted as completed while its painted cells reset', () => {
    const records = {
      [cat.id]: attempt(cat, [0, 0, 0, 0], { source: 'level', bestAt: older }),
    }
    expect(getPlayerStats(records, [cat])).toEqual({
      completedWorks: 1,
      paintedPixels: 0,
      totalLevels: getLevels().length,
    })
  })

  it('does not overcount when painted is shorter than cells', () => {
    const records = { [fox.id]: attempt(fox, [2, 0]) }
    expect(getPlayerStats(records, [fox]).paintedPixels).toBe(1)
  })

  it('counts level and free-paint attempts of the same picture separately', () => {
    const level = { ...cat, id: 'level-a' }
    const records = {
      [level.id]: attempt(level, [1, 1, 0, 2], { source: 'level', completedAt: older }),
      [cat.id]: attempt(cat, [1, 0, 0, 0], { source: 'artwork' }),
    }
    expect(getPlayerStats(records, [level, cat])).toMatchObject({
      completedWorks: 1,
      paintedPixels: 4,
    })
  })
})

describe('getPortfolio', () => {
  it('returns an empty list for an empty save', () => {
    expect(getPortfolio({}, [cat, fox])).toEqual([])
  })

  it('keeps only completed works, newest first, with source and completion time', () => {
    const records = {
      [cat.id]: attempt(cat, [1, 1, 0, 2], { source: 'artwork', completedAt: older }),
      [fox.id]: attempt(fox, [2, 0, 2, 2, 1], { source: 'user', completedAt: newer }),
    }
    const portfolio = getPortfolio(records, [cat, fox])
    expect(portfolio.map((entry) => entry.artwork.id)).toEqual([fox.id, cat.id])
    expect(portfolio[0]).toEqual({ artwork: fox, source: 'user', completedAt: newer })
    expect(portfolio[1]).toEqual({ artwork: cat, source: 'artwork', completedAt: older })
  })

  it('excludes unfinished works even when most cells are painted', () => {
    const records = { [fox.id]: attempt(fox, [2, 0, 2, 2, 0]) }
    expect(getPortfolio(records, [fox])).toEqual([])
  })

  it('keeps replayed works and falls back to the best result timestamp', () => {
    const records = {
      [cat.id]: attempt(cat, [0, 0, 0, 0], { source: 'level', bestAt: newer }),
    }
    expect(getPortfolio(records, [cat])).toEqual([
      { artwork: cat, source: 'level', completedAt: newer },
    ])
  })

  it('shows the latest completion time even when an older best result exists', () => {
    const records = {
      [cat.id]: attempt(cat, [1, 1, 0, 2], { source: 'level', completedAt: newer, bestAt: older }),
    }
    expect(getPortfolio(records, [cat])).toEqual([
      { artwork: cat, source: 'level', completedAt: newer },
    ])
  })

  it('collapses level and free-paint entries of the same picture to the newest one', () => {
    const level = { ...cat, id: 'level-a' }
    const records = {
      [level.id]: attempt(level, [1, 1, 0, 2], { source: 'level', completedAt: older }),
      [cat.id]: attempt(cat, [1, 1, 0, 2], { source: 'artwork', completedAt: newer }),
    }
    expect(getPortfolio(records, [level, cat])).toEqual([
      { artwork: cat, source: 'artwork', completedAt: newer },
    ])
    expect(getPortfolio(records, [cat, level])).toEqual([
      { artwork: cat, source: 'artwork', completedAt: newer },
    ])
  })

  it('keeps the level entry when the level replay is the newest completion', () => {
    const level = { ...cat, id: 'level-a' }
    const records = {
      [level.id]: attempt(level, [1, 1, 0, 2], { source: 'level', completedAt: newer }),
      [cat.id]: attempt(cat, [1, 1, 0, 2], { source: 'artwork', completedAt: older }),
    }
    expect(getPortfolio(records, [level, cat])).toEqual([
      { artwork: level, source: 'level', completedAt: newer },
    ])
  })

  it('dedups a replayed record against its twin by the best result time', () => {
    const level = { ...cat, id: 'level-a' }
    const records = {
      [level.id]: attempt(level, [0, 0, 0, 0], { source: 'level', bestAt: newer }),
      [cat.id]: attempt(cat, [1, 1, 0, 2], { source: 'artwork', completedAt: older }),
    }
    expect(getPortfolio(records, [level, cat])).toEqual([
      { artwork: level, source: 'level', completedAt: newer },
    ])
  })

  it('dedups by picture content, not by title', () => {
    const sameTitle = makeArtwork('art-c', '橘猫', [2, 2, 0, 1])
    const records = {
      [cat.id]: attempt(cat, [1, 1, 0, 2], { source: 'artwork', completedAt: older }),
      [sameTitle.id]: attempt(sameTitle, [2, 2, 0, 1], { source: 'artwork', completedAt: newer }),
    }
    expect(getPortfolio(records, [cat, sameTitle]).map((entry) => entry.artwork.id))
      .toEqual([sameTitle.id, cat.id])
  })

  it('falls back to level source for migrated records and breaks time ties by id', () => {
    const migrated = { ...attempt(cat, [1, 1, 0, 2], { completedAt: older }) }
    delete migrated.source
    const records = {
      [fox.id]: attempt(fox, [2, 0, 2, 2, 1], { source: 'user', completedAt: older }),
      [cat.id]: migrated,
    }
    const portfolio = getPortfolio(records, [fox, cat])
    expect(portfolio.map((entry) => entry.artwork.id)).toEqual([cat.id, fox.id])
    expect(portfolio[0].source).toBe('level')
    expect(portfolio[0].completedAt).toBe(older)
  })

  it('does not accept a fully painted record without a completion timestamp', () => {
    const records = { [fox.id]: attempt(fox, [2, 0, 2, 2, 1]) }
    expect(getPortfolio(records, [fox])).toEqual([])
    expect(getPlayerStats(records, [fox]).completedWorks).toBe(0)
  })
})