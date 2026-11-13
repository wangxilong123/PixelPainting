import type { PixelArtwork } from '../models/artwork'
import type { LevelProgress, ProgressSource } from '../models/level'
import { getLevels } from './levelService'
import { isLevelCleared } from './progressService'

export type PlayerStats = {
  completedWorks: number
  paintedPixels: number
  totalLevels: number
}

export type PortfolioEntry = {
  artwork: PixelArtwork
  source: ProgressSource
  completedAt?: string
}

function attemptOf(
  records: Record<string, LevelProgress>,
  artwork: PixelArtwork,
): LevelProgress | undefined {
  const attempt = records[artwork.id]
  return attempt?.levelId === artwork.id ? attempt : undefined
}

// 空格不算涂色成果；painted 比 cells 短时按未涂处理，避免把 undefined 当成已涂
function countPainted(artwork: PixelArtwork, attempt: LevelProgress): number {
  let count = 0
  for (const [index, colorId] of artwork.cells.entries()) {
    if (colorId === 0) continue
    if ((attempt.painted[index] ?? 0) !== 0) count += 1
  }
  return count
}

function completionTime(entry: PortfolioEntry): number {
  if (entry.completedAt === undefined) return Number.NEGATIVE_INFINITY
  const parsed = Date.parse(entry.completedAt)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

function byNewestCompletion(a: PortfolioEntry, b: PortfolioEntry): number {
  const diff = completionTime(b) - completionTime(a)
  if (diff !== 0) return diff
  return a.artwork.id < b.artwork.id ? -1 : a.artwork.id > b.artwork.id ? 1 : 0
}

// 素材复用关卡的像素数据但 ID 不同，判断「同一幅图」只能看内容本身
function imageKey(artwork: PixelArtwork): string {
  const palette = artwork.palette.map((color) => `${color.id}:${color.hex}`).join('|')
  return `${artwork.width}x${artwork.height}|${palette}|${artwork.cells.join(',')}`
}

/** 成绩全部从存档派生。重玩后 painted 归零但 bestResult 仍在，作品照样算完成过。 */
export function getPlayerStats(
  records: Record<string, LevelProgress>,
  artworks: readonly PixelArtwork[],
): PlayerStats {
  let completedWorks = 0
  let paintedPixels = 0
  for (const artwork of artworks) {
    const attempt = attemptOf(records, artwork)
    if (!attempt) continue
    if (isLevelCleared(artwork, attempt)) completedWorks += 1
    paintedPixels += countPainted(artwork, attempt)
  }
  return { completedWorks, paintedPixels, totalLevels: getLevels().length }
}

/** 作品集只收已完成的作品，最近完成的排在前面；同一幅图只留最近完成的一条。 */
export function getPortfolio(
  records: Record<string, LevelProgress>,
  artworks: readonly PixelArtwork[],
): PortfolioEntry[] {
  const entries = new Map<string, PortfolioEntry>()
  for (const artwork of artworks) {
    const attempt = attemptOf(records, artwork)
    if (!attempt || !isLevelCleared(artwork, attempt)) continue
    const entry: PortfolioEntry = { artwork, source: attempt.source ?? 'level' }
    // completedAt 每次完成都刷新，bestResult 只留最佳，重玩后前者缺席才用后者兜底
    const completedAt = attempt.completedAt ?? attempt.bestResult?.completedAt
    if (completedAt !== undefined) entry.completedAt = completedAt
    const key = imageKey(artwork)
    const kept = entries.get(key)
    if (!kept || byNewestCompletion(entry, kept) < 0) entries.set(key, entry)
  }
  return [...entries.values()].sort(byNewestCompletion)
}