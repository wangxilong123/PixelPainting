import { computed, readonly, shallowRef, type ShallowRef } from 'vue'
import type { Level, LevelProgress, LevelResult, LevelViewport } from '../models/level'
import { getLevelById, getLevels } from '../services/levelService'
import {
  createEmptyProgress,
  getLevelAccuracy,
  getStars,
  isLevelUnlocked,
  isLevelViewport,
  loadProgressSnapshot,
  saveProgressSnapshot,
  type ProgressSnapshot,
} from '../services/progressService'

const levels = getLevels()
let sharedState: ShallowRef<ProgressSnapshot> | undefined

function restoreProgress(): ProgressSnapshot {
  const snapshot = loadProgressSnapshot()
  const id = snapshot.currentLevelId
  if (id !== null && !isLevelUnlocked(levels, snapshot.levels, id)) {
    return { ...snapshot, currentLevelId: null }
  }
  return snapshot
}

function isBetterResult(result: LevelResult, best: LevelResult): boolean {
  if (result.stars !== best.stars) return result.stars > best.stars
  if (result.elapsedSeconds !== best.elapsedSeconds) {
    return result.elapsedSeconds < best.elapsedSeconds
  }
  return result.hintsUsed < best.hintsUsed
}

export function useLevelProgress() {
  const state = sharedState ??= shallowRef(restoreProgress())
  const currentLevelId = computed(() => state.value.currentLevelId)
  const currentLevel = computed(() => {
    const id = currentLevelId.value
    return id === null ? undefined : getLevelById(id)
  })
  const attempt = computed(() => {
    const id = currentLevelId.value
    return id === null ? undefined : state.value.levels[id]
  })
  const currentProgress = computed(() => attempt.value && readonly(attempt.value))
  const levelRecords = computed<Record<string, LevelProgress>>(() => ({ ...state.value.levels }))
  const accuracy = computed(() => {
    const level = currentLevel.value
    const progress = attempt.value
    return level && progress ? getLevelAccuracy(level, progress) : 0
  })

  function settleIfComplete(level: Level, progress: LevelProgress): void {
    if (getLevelAccuracy(level, progress) !== 1) return

    const result: LevelResult = {
      completedAt: new Date().toISOString(),
      stars: getStars(level, progress),
      elapsedSeconds: progress.elapsedSeconds,
      hintsUsed: progress.hintsUsed,
    }
    progress.completedAt = result.completedAt
    progress.stars = result.stars
    if (!progress.bestResult || isBetterResult(result, progress.bestResult)) {
      progress.bestResult = result
    }
  }

  function isOpenAttempt(): [Level, LevelProgress] | [] {
    const level = currentLevel.value
    const progress = attempt.value
    if (!level || !progress || progress.completedAt) return []
    return [level, progress]
  }

  function saveAttempt(progress: LevelProgress): void {
    const snapshot: ProgressSnapshot = {
      currentLevelId: progress.levelId,
      levels: { ...state.value.levels, [progress.levelId]: progress },
    }
    saveProgressSnapshot(snapshot)
    state.value = snapshot
  }

  function openLevel(levelId: string): boolean {
    const level = getLevelById(levelId)
    const records = state.value.levels
    if (!level || !isLevelUnlocked(levels, records, levelId)) return false

    const progress = records[levelId] ?? createEmptyProgress(level)
    const startedAt = progress.startedAt ?? new Date().toISOString()
    saveAttempt({ ...progress, startedAt })
    return true
  }

  function paintCell(index: number, colorId: number): 'painted' | 'incorrect' | 'ignored' {
    const level = currentLevel.value
    const progress = attempt.value
    if (!level || !progress || progress.completedAt || !Number.isInteger(index)) return 'ignored'

    const target = level.cells[index]
    if (target === undefined || target === 0 || progress.painted[index] !== 0) return 'ignored'
    if (target !== colorId) return 'incorrect'

    const painted = [...progress.painted]
    painted[index] = colorId
    const updated = { ...progress, painted }
    settleIfComplete(level, updated)
    saveAttempt(updated)
    return 'painted'
  }

  function revertCell(index: number): boolean {
    const opened = isOpenAttempt()
    if (!opened.length) return false
    const [, progress] = opened
    if (!Number.isInteger(index) || index < 0 || index >= progress.painted.length) return false
    if (progress.painted[index] === 0) return false

    const painted = [...progress.painted]
    painted[index] = 0
    saveAttempt({ ...progress, painted })
    return true
  }

  function repaintCell(index: number, colorId: number): boolean {
    const opened = isOpenAttempt()
    if (!opened.length) return false
    const [level, progress] = opened
    const target = level.cells[index]
    if (!Number.isInteger(index) || target === undefined || target === 0 || target !== colorId) {
      return false
    }
    if (progress.painted[index] !== 0) return false

    const painted = [...progress.painted]
    painted[index] = colorId
    const updated = { ...progress, painted }
    settleIfComplete(level, updated)
    saveAttempt(updated)
    return true
  }

  function recordHint(): number | undefined {
    const level = currentLevel.value
    const progress = attempt.value
    if (!level || !progress || progress.completedAt) return

    const index = level.cells.findIndex((color, i) => color !== 0 && progress.painted[i] === 0)
    if (index === -1) return

    saveAttempt({ ...progress, hintsUsed: progress.hintsUsed + 1 })
    return index
  }

  function setElapsedSeconds(seconds: number): void {
    const progress = attempt.value
    if (!progress || progress.completedAt || !Number.isInteger(seconds)
      || seconds <= progress.elapsedSeconds) return

    saveAttempt({ ...progress, elapsedSeconds: seconds })
  }

  function setViewport(viewport: LevelViewport): void {
    const progress = attempt.value
    if (!progress || !isLevelViewport(viewport)) return

    saveAttempt({ ...progress, viewport: { ...viewport } })
  }

  function restartLevel(): void {
    const level = currentLevel.value
    const progress = attempt.value
    if (!level || !progress) return

    const restarted = createEmptyProgress(level)
    restarted.startedAt = new Date().toISOString()
    if (progress.bestResult) {
      restarted.bestResult = progress.bestResult
    } else if (progress.completedAt) {
      restarted.bestResult = {
        completedAt: progress.completedAt,
        stars: progress.stars ?? getStars(level, progress),
        elapsedSeconds: progress.elapsedSeconds,
        hintsUsed: progress.hintsUsed,
      }
    }
    saveAttempt(restarted)
  }

  function getNextLevelId(): string | undefined {
    const index = levels.findIndex((level) => level.id === currentLevelId.value)
    if (index === -1) return

    const next = levels[index + 1]
    if (next && isLevelUnlocked(levels, state.value.levels, next.id)) return next.id
  }

  return {
    currentLevelId,
    currentProgress,
    levelRecords,
    accuracy,
    openLevel,
    paintCell,
    revertCell,
    repaintCell,
    recordHint,
    setElapsedSeconds,
    setViewport,
    restartLevel,
    getNextLevelId,
  }
}
