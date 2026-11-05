import { useLocalStorage } from '../composables/useLocalStorage'
import type { Level, LevelProgress, LevelResult, LevelViewport } from '../models/level'
import { getLevelById, getLevels } from './levelService'

export type ProgressSnapshot = {
  currentLevelId: string | null
  levels: Record<string, LevelProgress>
}

export type LevelSummary = {
  total: number
  completed: number
  stars: number
  maxStars: number
}

const storage = useLocalStorage('pixel-painting:v1:progress')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isRating(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3
}

function isLevelResult(value: unknown): value is LevelResult {
  return isRecord(value) && isTimestamp(value.completedAt) && isRating(value.stars)
    && isCount(value.elapsedSeconds) && isCount(value.hintsUsed)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isLevelViewport(value: unknown): value is LevelViewport {
  return isRecord(value) && isFiniteNumber(value.scale) && value.scale > 0
    && isFiniteNumber(value.offsetX) && isFiniteNumber(value.offsetY)
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

export function isLevelComplete(level: Level, progress: LevelProgress): boolean {
  let total = 0
  for (const [index, colorId] of level.cells.entries()) {
    if (colorId === 0) continue
    total += 1
    if (progress.painted[index] !== colorId) return false
  }
  return total > 0
}

export function getStars(level: Level, progress: LevelProgress): 1 | 2 | 3 {
  if (!isLevelComplete(level, progress)) return 1
  if (progress.hintsUsed === 0) return 3
  return progress.hintsUsed <= 2 ? 2 : 1
}

export function isLevelCleared(level: Level, attempt: LevelProgress | undefined): boolean {
  if (attempt?.levelId !== level.id) return false
  if (isLevelResult(attempt.bestResult)) return true
  return isTimestamp(attempt.completedAt) && isLevelComplete(level, attempt)
}

export function isLevelUnlocked(
  levels: Level[],
  progress: Record<string, LevelProgress>,
  levelId: string,
): boolean {
  const index = levels.findIndex((level) => level.id === levelId)
  if (index === -1) return false

  return levels.slice(0, index).every((level) => isLevelCleared(level, progress[level.id]))
}

export function getLevelSummary(records: Record<string, LevelProgress>): LevelSummary {
  const levels = getLevels()
  let completed = 0
  let stars = 0
  for (const level of levels) {
    const record = records[level.id]
    if (!isLevelCleared(level, record)) continue
    completed += 1
    stars += record?.bestResult?.stars ?? record?.stars ?? 0
  }
  return { total: levels.length, completed, stars, maxStars: levels.length * 3 }
}

function parseLevelProgress(level: Level, value: unknown): LevelProgress | undefined {
  if (!isRecord(value) || value.levelId !== level.id) return

  const { painted, elapsedSeconds, hintsUsed, startedAt, completedAt, stars, viewport, bestResult } = value
  if (!Array.isArray(painted) || painted.length !== level.cells.length
    || !painted.every((color, index) => color === 0 || color === level.cells[index])) return
  if (!isCount(elapsedSeconds) || !isCount(hintsUsed)) return
  if (startedAt !== undefined && !isTimestamp(startedAt)) return
  if (completedAt !== undefined && !isTimestamp(completedAt)) return
  if (stars !== undefined && !isRating(stars)) return
  if (viewport !== undefined && !isLevelViewport(viewport)) return
  if (bestResult !== undefined && !isLevelResult(bestResult)) return

  const progress: LevelProgress = { levelId: level.id, painted, elapsedSeconds, hintsUsed }
  const isComplete = isLevelComplete(level, progress)
  if (isComplete !== (completedAt !== undefined) || (!isComplete && stars !== undefined)) return

  if (startedAt !== undefined) progress.startedAt = startedAt
  if (completedAt !== undefined) {
    progress.completedAt = completedAt
    progress.stars = stars ?? getStars(level, progress)
  }
  if (viewport !== undefined) progress.viewport = viewport
  if (bestResult !== undefined) progress.bestResult = bestResult
  return progress
}

export function loadProgressSnapshot(): ProgressSnapshot {
  const snapshot: ProgressSnapshot = { currentLevelId: null, levels: {} }
  const raw = storage.read()
  if (raw === null) return snapshot

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return snapshot
  }

  if (!isRecord(value) || !isRecord(value.levels)
    || (value.currentLevelId !== null && typeof value.currentLevelId !== 'string')) return snapshot

  if (typeof value.currentLevelId === 'string' && getLevelById(value.currentLevelId)) {
    snapshot.currentLevelId = value.currentLevelId
  }
  for (const [id, entry] of Object.entries(value.levels)) {
    const level = getLevelById(id)
    const progress = level && parseLevelProgress(level, entry)
    if (progress) snapshot.levels[id] = progress
  }
  return snapshot
}

export function saveProgressSnapshot(snapshot: ProgressSnapshot): void {
  storage.write(JSON.stringify(snapshot))
}

export function loadProgress(): Record<string, LevelProgress> {
  return loadProgressSnapshot().levels
}

export function saveProgress(progress: Record<string, LevelProgress>): void {
  const { currentLevelId } = loadProgressSnapshot()
  saveProgressSnapshot({ currentLevelId, levels: progress })
}
