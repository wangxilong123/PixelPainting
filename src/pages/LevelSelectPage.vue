<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import LevelCard from '../components/LevelCard.vue'
import { useLevelProgress } from '../composables/useLevelProgress'
import type { Level, LevelCategory } from '../models/level'
import { getLevels } from '../services/levelService'
import { isLevelUnlocked } from '../services/progressService'

type LevelEntry = {
  level: Level
  unlocked: boolean
  stars?: 1 | 2 | 3
  completed: boolean
}

const categoryTitles: Record<LevelCategory, string> = {
  animal: '动物',
  food: '食物',
  plant: '植物',
  vehicle: '载具',
}

const router = useRouter()
const levels = getLevels()
const { levelRecords } = useLevelProgress()

const groups = computed(() => {
  const records = levelRecords.value
  const order: LevelCategory[] = []
  const entries = new Map<LevelCategory, LevelEntry[]>()
  for (const level of levels) {
    let list = entries.get(level.category)
    if (!list) {
      list = []
      entries.set(level.category, list)
      order.push(level.category)
    }
    const attempt = records[level.id]
    list.push({
      level,
      unlocked: isLevelUnlocked(levels, records, level.id),
      stars: attempt?.stars,
      completed: attempt?.completedAt !== undefined,
    })
  }
  return order.map((category) => ({
    category,
    title: categoryTitles[category],
    items: entries.get(category) ?? [],
  }))
})

function open(level: Level): void {
  router.push({ name: 'game', params: { levelId: level.id } })
}
</script>

<template>
  <div class="level-select-page">
    <h2 class="page-title">选择关卡</h2>
    <section v-for="group in groups" :key="group.category" class="level-group">
      <h2>{{ group.title }}</h2>
      <ul class="level-list">
        <li v-for="entry in group.items" :key="entry.level.id">
          <LevelCard
            :level="entry.level"
            :unlocked="entry.unlocked"
            :stars="entry.stars"
            :completed="entry.completed"
            @open="open(entry.level)"
          />
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.level-select-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.level-group h2 {
  margin: 0 0 var(--space-4);
  font-size: 1.1rem;
  color: var(--color-text-muted);
}

.level-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: var(--space-4);
}

.level-list .level-card {
  width: 100%;
}
</style>
