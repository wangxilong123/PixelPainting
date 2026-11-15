import type { Collection } from '../models/collection'
import donutCover from './levels/level-004.png'
import foxCover from './levels/level-006.png'
import penguinCover from './levels/level-008.png'

// 合集是素材的策展分组，复用现有素材与缩略图，不引入新像素数据。
// 封面取首幅成员的缩略图。橘猫/红苹果/盆栽小花已从素材库剔除，新手入门合集随之删除，
// 动物伙伴与美味食光只保留仍在库的成员。
export const presetCollections: readonly Collection[] = [
  {
    id: 'col-animals',
    title: '动物伙伴',
    tags: ['动物', '可爱', '伙伴'],
    cover: foxCover,
    artworkIds: ['art-006', 'art-007', 'art-008'],
  },
  {
    id: 'col-food',
    title: '美味食光',
    tags: ['食物', '甜点', '水果'],
    cover: donutCover,
    artworkIds: ['art-004'],
  },
  {
    id: 'col-big',
    title: '大图挑战',
    tags: ['大图', '进阶', '分块'],
    cover: penguinCover,
    artworkIds: ['art-005', 'art-008'],
  },
]