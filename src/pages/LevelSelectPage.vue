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

const activeLevel = computed(
  () => levels.find((level) => level.id === activeLevelId.value) ?? visibleLevels.value[0],
)

function open(levelId: string): void {
  router.push({ name: 'game', params: { levelId } })
}
</script>

<template>
  <div class="level-select-page">
    <div class="level-stats">
      <span class="stat">已完成 {{ summary.completed }}/{{ summary.total }}</span>
      <span class="stat">星级 {{ summary.stars }}/{{ summary.maxStars }}</span>
      <span class="stat current">{{ activeLevel?.title }}</span>
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

    <p class="carousel-hint">滚轮或左右方向键切换关卡，回车进入</p>
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
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.stat.current {
  margin-left: auto;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
}

.category-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.chip {
  padding: 0.3rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.chip.selected {
  border-color: var(--color-primary);
  background: var(--color-surface);
  color: var(--color-primary);
}

.carousel-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

@media (max-width: 640px) {
  .level-stats {
    padding: var(--space-4);
  }

  .stat.current {
    margin-left: 0;
    width: 100%;
  }

  .carousel-hint {
    display: none;
  }
}
</style>
