<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import LevelCarousel from '../components/LevelCarousel.vue'
import { useLevelProgress } from '../composables/useLevelProgress'
import { normalizeCategory } from '../data/categories'
import { getCategories, getLevels } from '../services/levelService'
import { getLevelSummary } from '../services/progressService'

const router = useRouter()
const levels = getLevels()
const categories = [{ id: 'all', label: '全部' }, ...getCategories()]
const { levelRecords } = useLevelProgress()

const activeCategory = ref('all')
const activeLevelId = ref<string>()

const visibleLevels = computed(() =>
  activeCategory.value === 'all'
    ? levels
    : levels.filter((level) => normalizeCategory(level.category).id === activeCategory.value),
)

const summary = computed(() => getLevelSummary(levelRecords.value))

function open(levelId: string): void {
  router.push({ name: 'game', params: { levelId } })
}
</script>

<template>
  <div class="level-select-page">
    <div class="level-stats">
      <span class="stat">已完成 {{ summary.completed }}/{{ summary.total }}</span>
    </div>

    <div class="category-chips" role="group" aria-label="分类筛选">
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        class="chip"
        :class="{ selected: category.id === activeCategory }"
        :aria-pressed="category.id === activeCategory"
        @click="activeCategory = category.id"
      >
        {{ category.label }}
      </button>
    </div>

    <LevelCarousel
      v-model="activeLevelId"
      :levels="visibleLevels"
      :records="levelRecords"
      @open="open"
    />
  </div>
</template>

<style scoped>
.level-select-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.level-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.stat {
  font-size: var(--font-meta);
  color: var(--color-text-muted);
}

.category-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.chip {
  padding: 0.3rem 0.9rem;
  border: var(--border-pixel) solid var(--color-border);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--font-chip);
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}

.chip:hover {
  border-color: var(--color-border-strong);
  color: var(--color-text);
}

.chip.selected {
  border-color: var(--color-primary);
  background: var(--color-surface);
  color: var(--color-primary);
}

@media (max-width: 640px) {
  .level-stats {
    padding: var(--space-4);
  }
}
</style>
