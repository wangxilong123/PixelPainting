import type { LevelParts, PaletteColor } from './level'

export type PixelArtwork = {
  id: string
  title: string
  tags: string[]
  width: number
  height: number
  palette: PaletteColor[]
  /** Row-major color IDs. Zero marks an empty cell. */
  cells: number[]
  /** Chunked painting over the whole grid. Only 2×2 and 3×3 count; anything else is one part. */
  parts?: LevelParts
  thumbnail?: string
  collectionIds?: string[]
}