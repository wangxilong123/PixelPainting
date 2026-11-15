import type { PixelArtwork } from '../../models/artwork'
import { presetLevels } from '../levels'

// 素材复用关卡的像素数据，但走独立 id 序列：自由涂色与关卡模式各写各的进度，互不干扰解锁。
// 前三幅（橘猫/红苹果/盆栽小花）只留在关卡模式，不进素材库；剔除后仍保留 art-004…008 原 id，
// 旧存档与合集引用照常解析。id 先按关卡序号绑定再过滤，避免剔除导致后续编号错位。
const levelsNotInMaterials = new Set(['level-001', 'level-002', 'level-003'])
export const presetArtworks: readonly PixelArtwork[] = presetLevels
  .map((level, index) => ({ level, id: `art-${String(index + 1).padStart(3, '0')}` }))
  .filter(({ level }) => !levelsNotInMaterials.has(level.id))
  .map(({ level, id }) => ({
    id,
    title: level.title,
    tags: [...level.tags],
    width: level.width,
    height: level.height,
    palette: level.palette,
    cells: level.cells,
    parts: level.parts,
    thumbnail: level.thumbnail,
  }))