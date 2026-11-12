import { computed, readonly, shallowRef, type ShallowRef } from 'vue'
import type { PixelArtwork } from '../models/artwork'
import type { LevelProgress, LevelResult, LevelViewport } from '../models/level'
import { getArtworkById } from '../services/artworkService'
import { getLevelById, getLevels, getPartRects, type PartRect } from '../services/levelService'
import {
  createEmptyProgress,
  isLevelComplete,
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
  const id = snapshot.currentId
  // 自由涂色没有解锁；只有当前项是关卡且未解锁时才回退
  if (id !== null && getLevelById(id) && !isLevelUnlocked(levels, snapshot.records, id)) {
    return { ...snapshot, currentId: null }
  }
  return snapshot
}

function isBetterResult(result: LevelResult, best: LevelResult): boolean {
  if (result.elapsedSeconds !== best.elapsedSeconds) {
    return result.elapsedSeconds < best.elapsedSeconds
  }
  return result.hintsUsed < best.hintsUsed
}

function findHintCell(
  level: PixelArtwork,
  rect: PartRect,
  colorId: number,
  painted: readonly number[],
): number {
  for (let row = rect.y; row < rect.y + rect.height; row += 1) {
    for (let column = rect.x; column < rect.x + rect.width; column += 1) {
      const index = row * level.width + column
      if (level.cells[index] === colorId && painted[index] === 0) return index
    }
  }
  return -1
}

export function useLevelProgress() {
  const state = sharedState ??= shallowRef(restoreProgress())
  const currentLevelId = computed(() => state.value.currentId)
  const currentLevel = computed(() => {
    const id = currentLevelId.value
    return id === null ? undefined : getLevelById(id) ?? getArtworkById(id)
  })
  const attempt = computed(() => {
    const id = currentLevelId.value
    return id === null ? undefined : state.value.records[id]
  })
  const currentProgress = computed(() => attempt.value && readonly(attempt.value))
  const levelRecords = computed<Record<string, LevelProgress>>(() => ({ ...state.value.records }))

  function settleIfComplete(level: PixelArtwork, progress: LevelProgress): void {
    if (!isLevelComplete(level, progress)) return

    const result: LevelResult = {
      completedAt: new Date().toISOString(),
      elapsedSeconds: progress.elapsedSeconds,
      hintsUsed: progress.hintsUsed,
    }
    progress.completedAt = result.completedAt
    if (!progress.bestResult || isBetterResult(result, progress.bestResult)) {
      progress.bestResult = result
    }
  }

  function isOpenAttempt(): [PixelArtwork, LevelProgress] | [] {
    const level = currentLevel.value
    const progress = attempt.value
    if (!level || !progress || progress.completedAt) return []
    return [level, progress]
  }

  function saveAttempt(progress: LevelProgress): void {
    const snapshot: ProgressSnapshot = {
      currentId: progress.levelId,
      records: { ...state.value.records, [progress.levelId]: progress },
    }
    saveProgressSnapshot(snapshot)
    state.value = snapshot
  }

  function openLevel(levelId: string): boolean {
    const level = getLevelById(levelId)
    const records = state.value.records
    if (!level || !isLevelUnlocked(levels, records, levelId)) return false

    const progress = records[levelId] ?? createEmptyProgress(level)
    const startedAt = progress.startedAt ?? new Date().toISOString()
    saveAttempt({ ...progress, startedAt })
    return true
  }

  function openArtwork(artworkId: string): boolean {
    const artwork = getArtworkById(artworkId)
    if (!artwork) return false

    const progress = state.value.records[artworkId] ?? createEmptyProgress(artwork, 'artwork')
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

  function recordHint(colorId: number | null): number | undefined {
    const level = currentLevel.value
    const progress = attempt.value
    if (!level || !progress || progress.completedAt || colorId === null) return

    // 引导式分块一次只涂一块：提示只在当前块里找选中色的未涂格，
    // 这块没有就返回 undefined，不能把玩家带去别的块
    const rects = getPartRects(level)
    const current = Math.min(progress.partIndex ?? 0, rects.length - 1)
    const cell = findHintCell(level, rects[current], colorId, progress.painted)
    if (cell === -1) return

    saveAttempt({ ...progress, hintsUsed: progress.hintsUsed + 1 })
    return cell
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

  function setPartIndex(index: number): void {
    const level = currentLevel.value
    const progress = attempt.value
    if (!level || !progress) return
    if (!Number.isInteger(index) || index < 0 || index >= getPartRects(level).length) return

    saveAttempt({ ...progress, partIndex: index })
  }

  function restartLevel(): void {
    const level = currentLevel.value
    const progress = attempt.value
    if (!level || !progress) return

    const restarted = createEmptyProgress(level, progress.source ?? 'level')
    restarted.startedAt = new Date().toISOString()
    if (progress.bestResult) {
      restarted.bestResult = progress.bestResult
    } else if (progress.completedAt) {
      restarted.bestResult = {
        completedAt: progress.completedAt,
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
    if (next && isLevelUnlocked(levels, state.value.records, next.id)) return next.id
  }

  return {
    currentLevelId,
    currentProgress,
    levelRecords,
    openLevel,
    openArtwork,
    paintCell,
    revertCell,
    repaintCell,
    recordHint,
    setElapsedSeconds,
    setViewport,
    setPartIndex,
    restartLevel,
    getNextLevelId,
  }
}
