export type LevelCategory = 'animal' | 'food' | 'plant' | 'vehicle'

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
}

export type LevelViewport = {
  scale: number
  offsetX: number
  offsetY: number
}

export type LevelResult = {
  completedAt: string
  stars: 1 | 2 | 3
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
  stars?: 1 | 2 | 3
  viewport?: LevelViewport
  bestResult?: LevelResult
}
