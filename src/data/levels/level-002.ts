import type { Level } from '../../models/level'

const rows = [
  '00022000',
  '00020000',
  '01100110',
  '11111111',
  '13111111',
  '11111111',
  '01111110',
  '00100100',
]

export const level002: Level = {
  id: 'level-002',
  title: '红苹果',
  category: 'food',
  difficulty: 1,
  width: 8,
  height: 8,
  palette: [
    { id: 1, hex: '#E84D56', name: '苹果红' },
    { id: 2, hex: '#58A65C', name: '叶绿' },
    { id: 3, hex: '#FFB4B7', name: '浅红' },
  ],
  cells: Array.from(rows.join(''), Number),
}
