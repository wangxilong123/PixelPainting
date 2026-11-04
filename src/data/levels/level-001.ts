import type { Level } from '../../models/level'

const rows = [
  '00100100',
  '01200210',
  '01111110',
  '11211211',
  '11133111',
  '01111110',
  '00111100',
  '00000000',
]

export const level001: Level = {
  id: 'level-001',
  title: '橘猫',
  category: 'animal',
  difficulty: 1,
  width: 8,
  height: 8,
  palette: [
    { id: 1, hex: '#F4A261', name: '橘色' },
    { id: 2, hex: '#45312F', name: '深棕' },
    { id: 3, hex: '#F4A7BB', name: '粉色' },
  ],
  cells: Array.from(rows.join(''), Number),
}
