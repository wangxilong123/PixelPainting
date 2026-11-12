import type { Collection } from '../models/collection'
import donutCover from './levels/level-004.png'
import foxCover from './levels/level-006.png'
import penguinCover from './levels/level-008.png'

// 合集是素材的策展分组，复用现有素材与缩略图，不引入新像素数据。
// 封面取内含素材的缩略图；新手入门三幅都是小图无缩略图，留空让卡片回退到像素预览。
export const presetCollections: readonly Collection[] = [
  {
    id: 'col-starter',
    title: '新手入门',
    tags: ['入门', '简单', '小图'],
    cover: '',
    artworkIds: ['art-001', 'art-002', 'art-003'],
  },
  {
    id: 'col-animals',
    title: '动物伙伴',
    tags: ['动物', '可爱', '伙伴'],
    cover: foxCover,
    artworkIds: ['art-001', 'art-006', 'art-007', 'art-008'],
  },
  {
    id: 'col-food',
    title: '美味食光',
    tags: ['食物', '甜点', '水果'],
    cover: donutCover,
    artworkIds: ['art-002', 'art-004'],
  },
  {
    id: 'col-big',
    title: '大图挑战',
    tags: ['大图', '进阶', '分块'],
    cover: penguinCover,
    artworkIds: ['art-005', 'art-008'],
  },
]