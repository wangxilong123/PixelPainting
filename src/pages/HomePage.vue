<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLevelProgress } from '../composables/useLevelProgress'
import { getLevels } from '../services/levelService'
import { isLevelUnlocked } from '../services/progressService'

const router = useRouter()
const levels = getLevels()
const { levelRecords, currentLevelId } = useLevelProgress()

const startLevelId = computed(() => {
  const records = levelRecords.value
  const playable = levels.find(
    (level) => isLevelUnlocked(levels, records, level.id) && records[level.id]?.completedAt === undefined,
  )
  return (playable ?? levels[levels.length - 1]).id
})

const continueLevelId = computed(() => {
  const id = currentLevelId.value
  return id !== null && levelRecords.value[id]?.completedAt === undefined ? id : null
})

const summary = computed(() => {
  const records = levelRecords.value
  let completed = 0
  let stars = 0
  for (const level of levels) {
    const attempt = records[level.id]
    if (attempt?.bestResult) {
      completed += 1
      stars += attempt.bestResult.stars
    } else if (attempt?.completedAt) {
      completed += 1
      stars += attempt.stars ?? 0
    }
  }
  return { completed, total: levels.length, stars, maxStars: levels.length * 3 }
})

function go(levelId: string | null): void {
  if (levelId) router.push({ name: 'game', params: { levelId } })
}
</script>

<template>
  <div class="home-page">
    <h2>欢迎来到像素涂色</h2>
    <p class="home-summary">
      已完成 {{ summary.completed }} / {{ summary.total }} 关 · 累计 {{ summary.stars }} / {{ summary.maxStars }} 星
    </p>
    <div class="home-actions">
      <button type="button" class="primary" @click="go(startLevelId)">开始游戏</button>
      <button v-if="continueLevelId" type="button" @click="go(continueLevelId)">继续上次</button>
      <RouterLink class="home-link" to="/levels">全部关卡</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.home-summary {
  margin: 0;
  color: var(--color-text-muted);
}

.home-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
}

.home-actions button {
  padding: 0.6rem 1.2rem;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}

.home-actions button.primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-background);
  font-weight: 600;
}

.home-link {
  color: var(--color-text-muted);
}
</style>
