import type { PixelArtwork } from '../../models/artwork'
import { presetLevels } from '../levels'

// 首批素材复用关卡的像素数据，但走独立 id 序列：
// 自由涂色与关卡模式各写各的进度，互不干扰解锁。
export const presetArtworks: readonly PixelArtwork[] = presetLevels.map((level, index) => ({
  id: `art-${String(index + 1).padStart(3, '0')}`,
  title: level.title,
  tags: [...level.tags],
  width: level.width,
  height: level.height,
  palette: level.palette,
  cells: level.cells,
  parts: level.parts,
  thumbnail: level.thumbnail,
}))