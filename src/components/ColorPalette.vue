<script setup lang="ts">
import { computed } from 'vue'
import type { PaletteColor } from '../models/level'

const props = withDefaults(defineProps<{
  palette: PaletteColor[]
  cells: readonly number[]
  painted: readonly number[]
  selectedColorId: number | null
  showRemaining?: boolean
}>(), { showRemaining: true })

const emit = defineEmits<{ select: [colorId: number] }>()

const remaining = computed(() => {
  const counts = new Map<number, { target: number; done: number }>()
  for (const color of props.palette) counts.set(color.id, { target: 0, done: 0 })
  props.cells.forEach((target, index) => {
    const entry = target === 0 ? undefined : counts.get(target)
    if (!entry) return
    entry.target += 1
    if (props.painted[index] === target) entry.done += 1
  })
  return counts
})
</script>

<template>
  <div class="color-palette" role="group" aria-label="调色板">
    <button
      v-for="color in palette"
      :key="color.id"
      type="button"
      class="color-swatch"
      :class="{ selected: selectedColorId === color.id }"
      :aria-pressed="selectedColorId === color.id"
      :aria-label="`颜色 ${color.id} ${color.name}`"
      @click="emit('select', color.id)"
    >
      <span class="swatch-fill" :style="{ background: color.hex }" aria-hidden="true">
        <span class="swatch-index">{{ color.id }}</span>
      </span>
      <span class="swatch-name">{{ color.name }}</span>
      <span v-if="showRemaining" class="swatch-count">
        {{ (remaining.get(color.id)?.target ?? 0) - (remaining.get(color.id)?.done ?? 0) }}
      </span>
    </button>
  </div>
</template>

<style scoped>
/* 颜色多时横向滚动，不把画布顶下去；内边距给角上的编号留出位置 */
.color-palette {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-1);
  overflow-x: auto;
  scrollbar-width: thin;
}

.color-swatch {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem;
  border: var(--border-pixel) solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.color-swatch:hover {
  border-color: var(--color-border-strong);
}

.color-swatch.selected {
  border-color: var(--color-primary);
  background: var(--color-surface-raised);
}

.swatch-fill {
  position: relative;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
}

/* 编号压在色块角上，底色用面板色，避免和填充色撞在一起看不清 */
.swatch-index {
  position: absolute;
  top: -0.45rem;
  left: -0.45rem;
  min-width: 1.15rem;
  padding: 0 0.2rem;
  border: 1px solid var(--color-border);
  border-radius: 0.4rem;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.7rem;
  line-height: 1.15rem;
  text-align: center;
}

.swatch-name {
  font-size: 0.8rem;
}

.swatch-count {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
</style>
