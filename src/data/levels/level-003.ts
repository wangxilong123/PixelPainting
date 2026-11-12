import type { Level } from '../../models/level'

const rows = [
  '0000330000',
  '0003233000',
  '0003330000',
  '0000110000',
  '0011111100',
  '0000110000',
  '0004444000',
  '0000440000',
]

export const level003: Level = {
  id: 'level-003',
  title: '盆栽小花',
  tags: ['植物', '花', '盆栽', 'flower'],
  category: 'other',
  difficulty: 2,
  width: 10,
  height: 8,
  order: 3,
  palette: [
    { id: 1, hex: '#4A9D62', name: '茎叶绿' },
    { id: 2, hex: '#F6C453', name: '花心黄' },
    { id: 3, hex: '#E8789F', name: '花瓣粉' },
    { id: 4, hex: '#C47B58', name: '陶土色' },
  ],
  cells: Array.from(rows.join(''), Number),
}
