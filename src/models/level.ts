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

export type LevelProgress = {
  levelId: string
  painted: number[]
  startedAt?: string
  completedAt?: string
  hintsUsed: number
  elapsedSeconds: number
  stars?: 1 | 2 | 3
}
