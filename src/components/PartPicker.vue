<script setup lang="ts">
import { computed } from 'vue'
import type { PixelArtwork } from '../models/artwork'
import { normalizeParts, type PartRect } from '../services/levelService'
import PixelIcon from './PixelIcon.vue'

const props = defineProps<{
  level: PixelArtwork
  parts: PartRect[]
  painted: readonly number[]
  partIndex: number
}>()

const emit = defineEmits<{ select: [index: number] }>()

const cols = computed(() => normalizeParts(props.level).cols)

const counts = computed(() => props.parts.map((rect) => {
  let total = 0
  let done = 0
  for (let row = rect.y; row < rect.y + rect.height; row += 1) {
    for (let column = rect.x; column < rect.x + rect.width; column += 1) {
      const index = row * props.level.width + column
      const target = props.level.cells[index]
      if (target === 0) continue
      total += 1
      if (props.painted[index] === target) done += 1
    }
  }
  return { total, done }
}))

function isDone(index: number): boolean {
  const entry = counts.value[index]
  return entry !== undefined && entry.total > 0 && entry.done === entry.total
}
</script>

<template>
  <div v-if="parts.length > 1" class="part-picker" role="group" aria-label="分块">
    <div class="part-grid" :style="{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }">
      <button
        v-for="(rect, index) in parts"
        :key="rect.index"
        type="button"
        class="part-cell"
        :class="{ current: index === partIndex, done: isDone(index) }"
        :aria-current="index === partIndex ? 'true' : undefined"
        :aria-label="`第 ${index + 1} 块，已填 ${counts[index].done} / ${counts[index].total}`"
        @click="emit('select', index)"
      >
        <span class="part-number">{{ index + 1 }}</span>
        <span class="part-count">{{ counts[index].done }}/{{ counts[index].total }}</span>
      </button>
    </div>

    <div class="part-stepper">
      <button type="button" :disabled="partIndex === 0" @click="emit('select', partIndex - 1)">
        <PixelIcon name="arrow-left" />
        <span>上一块</span>
      </button>
      <span class="part-position">第 {{ partIndex + 1 }}/{{ parts.length }} 块 · 已填 {{ counts[partIndex].done }}/{{ counts[partIndex].total }}</span>
      <button
        type="button"
        :disabled="partIndex === parts.length - 1"
        @click="emit('select', partIndex + 1)"
      >
        <span>下一块</span>
        <PixelIcon name="arrow-right" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.part-picker {
  display: flex;
  gap: var(--space-4);
}

/* 九宫格按分块的行列排，玩家看位置就知道自己在整图的哪一角 */
.part-grid {
  display: grid;
  flex: 1 1 auto;
  gap: var(--space-2);
}

.part-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: 0.35rem 0.7rem;
  border: var(--border-pixel) solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color var(--transition-fast), background-color var(--transition-fast);
}

.part-cell:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-raised);
}

.part-cell.current {
  border-color: var(--color-primary);
  background: var(--color-surface-raised);
}

.part-cell.done .part-count {
  color: var(--color-primary);
}

.part-number {
  font-variant-numeric: tabular-nums;
}

.part-count {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.part-stepper {
  display: none;
  flex: 1 1 auto;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.part-stepper button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: var(--border-pixel) solid var(--color-border);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: var(--action-font);
  cursor: pointer;
}

.part-stepper button .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
}

.part-stepper button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.part-position {
  color: var(--color-text-muted);
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
}

/* 窄屏放不下九宫格，折成一行步进按钮 */
@media (max-width: 640px) {
  .part-grid {
    display: none;
  }

  .part-stepper {
    display: flex;
  }
}
</style>
