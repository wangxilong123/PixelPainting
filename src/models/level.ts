/** Registry ID from src/data/categories.ts. Unknown IDs fall back to 其他. */
export type LevelCategory = string

export type PaletteColor = {
  id: number
  hex: string
  name: string
}

export type Level = {
  id: string
  title: string
  category: LevelCategory
  difficulty: 1 | 2 | 3
  width: number
  height: number
  palette: PaletteColor[]
  /** Row-major color IDs. Zero marks an empty cell. */
  cells: number[]
  thumbnail?: string
  /** Unlock position. Levels without one keep registration order at the end. */
  order?: number
  tags?: string[]
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

export type LevelProgress = {
  levelId: string
  /** Color IDs at the same indexes as Level.cells. Zero means unpainted. */
  painted: number[]
  startedAt?: string
  completedAt?: string
  hintsUsed: number
  elapsedSeconds: number
  viewport?: LevelViewport
  bestResult?: LevelResult
}
