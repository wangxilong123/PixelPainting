<script setup lang="ts">
import { computed } from 'vue'
import type { PixelArtwork } from '../models/artwork'

const props = defineProps<{ level: PixelArtwork }>()

const cells = computed(() => {
  const hexes = new Map(props.level.palette.map((color) => [color.id, color.hex]))
  return props.level.cells.map((id) => (id === 0 ? null : hexes.get(id) ?? null))
})

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${props.level.width}, 1fr)`,
  aspectRatio: `${props.level.width} / ${props.level.height}`,
}))
</script>

<template>
  <span class="pixel-preview" aria-hidden="true" :style="gridStyle">
    <span
      v-for="(hex, index) in cells"
      :key="index"
      class="preview-cell"
      :style="hex ? { background: hex } : undefined"
    />
  </span>
</template>

<style scoped>
.pixel-preview {
  display: grid;
  gap: 1px;
  background: var(--color-border);
  border: 1px solid var(--color-border);
}

.preview-cell {
  background: transparent;
}
</style>
