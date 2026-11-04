import type { Level, LevelProgress } from '../models/level'
import { getInteractiveCellCount } from './levelService'

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isRating(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3
}

export function createEmptyProgress(level: Level): LevelProgress {
  return {
    levelId: level.id,
    painted: Array<number>(level.cells.length).fill(0),
    elapsedSeconds: 0,
    hintsUsed: 0,
    viewport: { scale: 1, offsetX: 0, offsetY: 0 },
  }
}

export function getLevelAccuracy(level: Level, progress: LevelProgress): number {
  const total = getInteractiveCellCount(level)
  if (total === 0) return 0

  let correct = 0
  for (const [index, colorId] of level.cells.entries()) {
    if (colorId !== 0 && progress.painted[index] === colorId) correct += 1
  }
  return correct / total
}

export function getStars(level: Level, progress: LevelProgress): 1 | 2 | 3 {
  if (getLevelAccuracy(level, progress) !== 1) return 1
  if (progress.hintsUsed === 0) return 3
  return progress.hintsUsed <= 2 ? 2 : 1
}

export function isLevelUnlocked(
  levels: Level[],
  progress: Record<string, LevelProgress>,
  levelId: string,
): boolean {
  const index = levels.findIndex((level) => level.id === levelId)
  if (index === -1) return false

  return levels.slice(0, index).every((level) => {
    const attempt = progress[level.id]
    if (attempt?.levelId !== level.id) return false

    const best = attempt.bestResult
    if (best && isTimestamp(best.completedAt) && isRating(best.stars)
      && isCount(best.elapsedSeconds) && isCount(best.hintsUsed)) {
      return true
    }
    return isTimestamp(attempt.completedAt) && getLevelAccuracy(level, attempt) === 1
  })
}
