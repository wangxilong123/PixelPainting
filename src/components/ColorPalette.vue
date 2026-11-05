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
      @click="emit('select', color.id)"
    >
      <span class="swatch-fill" :style="{ background: color.hex }" aria-hidden="true" />
      <span class="swatch-name">{{ color.name }}</span>
      <span v-if="showRemaining" class="swatch-count">
        {{ (remaining.get(color.id)?.target ?? 0) - (remaining.get(color.id)?.done ?? 0) }}
      </span>
    </button>
  </div>
</template>

<style scoped>
.color-palette {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.color-swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}

.color-swatch.selected {
  border-color: var(--color-primary);
}

.swatch-fill {
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
}

.swatch-name {
  font-size: 0.8rem;
}

.swatch-count {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
</style>
