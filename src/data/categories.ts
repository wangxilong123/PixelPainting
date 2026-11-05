export type LevelCategoryEntry = {
  id: string
  label: string
}

export const fallbackCategory: LevelCategoryEntry = { id: 'other', label: '其他' }

// 分类是可扩展注册表，新增分类只改这里，不改 Level 类型
export const levelCategories: LevelCategoryEntry[] = [
  { id: 'animal', label: '动物' },
  { id: 'food', label: '食物' },
  { id: 'tech', label: '科技' },
  fallbackCategory,
]

export function normalizeCategory(category: string): LevelCategoryEntry {
  return levelCategories.find((entry) => entry.id === category) ?? fallbackCategory
}
