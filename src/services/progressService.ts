import { useLocalStorage } from '../composables/useLocalStorage'
import type { PixelArtwork } from '../models/artwork'
import type { Level, LevelProgress, LevelResult, LevelViewport, ProgressSource } from '../models/level'
import { getArtworkById } from './artworkService'
import { getLevelById, getLevels, getPartRects } from './levelService'

export type ProgressSnapshot = {
  currentId: string | null
  records: Record<string, LevelProgress>
}

export type LevelSummary = {
  total: number
  completed: number
}

const storage = useLocalStorage('pixel-painting:v2:progress')
const legacyStorage = useLocalStorage('pixel-painting:v1:progress')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isLevelResult(value: unknown): value is LevelResult {
  return isRecord(value) && isTimestamp(value.completedAt)
    && isCount(value.elapsedSeconds) && isCount(value.hintsUsed)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isProgressSource(value: unknown): value is ProgressSource {
  return value === 'level' || value === 'artwork' || value === 'user'
}

export function isLevelViewport(value: unknown): value is LevelViewport {
  return isRecord(value) && isFiniteNumber(value.scale) && value.scale > 0
    && isFiniteNumber(value.offsetX) && isFiniteNumber(value.offsetY)
}

export function createEmptyProgress(work: PixelArtwork, source: ProgressSource = 'level'): LevelProgress {
  return {
    levelId: work.id,
    source,
    painted: Array<number>(work.cells.length).fill(0),
    elapsedSeconds: 0,
    hintsUsed: 0,
    viewport: { scale: 1, offsetX: 0, offsetY: 0 },
  }
}

export function isLevelComplete(level: PixelArtwork, progress: LevelProgress): boolean {
  let total = 0
  for (const [index, colorId] of level.cells.entries()) {
    if (colorId === 0) continue
    total += 1
    if (progress.painted[index] !== colorId) return false
  }
  return total > 0
}

export function isLevelCleared(level: PixelArtwork, attempt: LevelProgress | undefined): boolean {
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
  for (const level of levels) {
    if (!isLevelCleared(level, records[level.id])) continue
    completed += 1
  }
  return { total: levels.length, completed }
}

function parseLevelProgress(
  level: PixelArtwork,
  value: unknown,
  fallbackSource: ProgressSource,
): LevelProgress | undefined {
  if (!isRecord(value) || value.levelId !== level.id) return

  // 旧存档可能还带着已废弃的 stars 字段，忽略即可，不要因此拒收整条记录
  const {
    painted, elapsedSeconds, hintsUsed, startedAt, completedAt, viewport, bestResult, partIndex,
  } = value
  if (!Array.isArray(painted) || painted.length !== level.cells.length
    || !painted.every((color, index) => color === 0 || color === level.cells[index])) return
  if (!isCount(elapsedSeconds) || !isCount(hintsUsed)) return
  if (startedAt !== undefined && !isTimestamp(startedAt)) return
  if (completedAt !== undefined && !isTimestamp(completedAt)) return
  if (viewport !== undefined && !isLevelViewport(viewport)) return
  if (bestResult !== undefined && !isLevelResult(bestResult)) return

  const progress: LevelProgress = {
    levelId: level.id,
    source: isProgressSource(value.source) ? value.source : fallbackSource,
    painted,
    elapsedSeconds,
    hintsUsed,
  }
  if (isLevelComplete(level, progress) !== (completedAt !== undefined)) return

  if (startedAt !== undefined) progress.startedAt = startedAt
  if (completedAt !== undefined) progress.completedAt = completedAt
  if (viewport !== undefined) progress.viewport = viewport
  if (bestResult !== undefined) progress.bestResult = bestResult
  // 重转关卡会改分块数，越界的块号只丢字段，不能连累已涂进度
  if (isCount(partIndex) && partIndex < getPartRects(level).length) progress.partIndex = partIndex
  return progress
}

// 2026-11-10 关卡文件按游玩顺序重排：甜甜圈 level-005→level-004、火箭 level-009→level-005。
// 存档以关卡 ID 为键，旧键整体搬到新键；格子数对不上的记录照旧由 parseLevelProgress 拒收。
const renamedLevelIds: Record<string, string> = {
  'level-005': 'level-004',
  'level-009': 'level-005',
}

function findWork(id: string): PixelArtwork | undefined {
  return getLevelById(id) ?? getArtworkById(id)
}

function parseSnapshot(raw: string, legacy: boolean): ProgressSnapshot {
  const snapshot: ProgressSnapshot = { currentId: null, records: {} }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return snapshot
  }

  const recordsKey = legacy ? 'levels' : 'records'
  const currentKey = legacy ? 'currentLevelId' : 'currentId'
  if (!isRecord(value) || !isRecord(value[recordsKey])
    || (value[currentKey] !== null && typeof value[currentKey] !== 'string')) return snapshot

  if (typeof value[currentKey] === 'string') {
    const rawCurrent = value[currentKey]
    const currentId = legacy && !getLevelById(rawCurrent)
      ? renamedLevelIds[rawCurrent] ?? rawCurrent
      : rawCurrent
    if (findWork(currentId)) snapshot.currentId = currentId
  }
  for (const [rawId, entry] of Object.entries(value[recordsKey])) {
    // 先按当前 ID 解释：重命名之后写的新存档里 level-005 就是火箭；
    // 格子数对不上才说明是重命名前的旧键（那时的 level-005 是甜甜圈），搬到新键。
    for (const id of legacy ? [rawId, renamedLevelIds[rawId]] : [rawId]) {
      if (!id) continue
      const work = findWork(id)
      if (!work) continue
      const sourceEntry = id === rawId ? entry : isRecord(entry) ? { ...entry, levelId: id } : entry
      const fallback: ProgressSource = legacy || getLevelById(id) ? 'level' : 'artwork'
      const progress = parseLevelProgress(work, sourceEntry, fallback)
      if (!progress) continue
      snapshot.records[id] = progress
      break
    }
  }
  return snapshot
}

export function loadProgressSnapshot(): ProgressSnapshot {
  const raw = storage.read()
  if (raw !== null) return parseSnapshot(raw, false)

  // v1 只在 v2 缺席时读一次并写回 v2；之后 v1 不再参与，旧数据盖不掉新进度
  const legacy = legacyStorage.read()
  if (legacy === null) return { currentId: null, records: {} }
  const migrated = parseSnapshot(legacy, true)
  storage.write(JSON.stringify(migrated))
  return migrated
}

export function saveProgressSnapshot(snapshot: ProgressSnapshot): void {
  storage.write(JSON.stringify(snapshot))
}

export function loadProgress(): Record<string, LevelProgress> {
  return loadProgressSnapshot().records
}

export function saveProgress(progress: Record<string, LevelProgress>): void {
  const { currentId } = loadProgressSnapshot()
  saveProgressSnapshot({ currentId, records: progress })
}
