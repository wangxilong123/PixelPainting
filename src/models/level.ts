import type { PixelArtwork } from './artwork'

/** Registry ID from src/data/categories.ts. Unknown IDs fall back to 其他. */
export type LevelCategory = string

export type PaletteColor = {
  id: number
  hex: string
  name: string
}

export type LevelParts = {
  cols: number
  rows: number
}

export type Level = PixelArtwork & {
  category: LevelCategory
  difficulty: 1 | 2 | 3
  /** Unlock position. Levels without one keep registration order at the end. */
  order?: number
  source?: 'preset' | 'user'
}

export type LevelViewport = {
  scale: number
  offsetX: number
  offsetY: number
}

export type LevelResult = {
  completedAt: string
  elapsedSeconds: number
  hintsUsed: number
}

export type ProgressSource = 'level' | 'artwork' | 'user'

export type LevelProgress = {
  levelId: string
  /** Which mode the attempt belongs to. Absent in migrated pre-v2 records means level. */
  source?: ProgressSource
  /** Color IDs at the same indexes as Level.cells. Zero means unpainted. */
  painted: number[]
  startedAt?: string
  completedAt?: string
  hintsUsed: number
  elapsedSeconds: number
  viewport?: LevelViewport
  /** Part the player is looking at. Absent means the first one. */
  partIndex?: number
  bestResult?: LevelResult
}
