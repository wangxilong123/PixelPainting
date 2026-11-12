<script setup lang="ts">
import { computed } from 'vue'
import type { PixelArtwork } from '../models/artwork'
import { getInteractiveCellCount } from '../services/levelService'
import PixelPreview from './PixelPreview.vue'

const props = defineProps<{ artwork: PixelArtwork }>()

const cellCount = computed(() => getInteractiveCellCount(props.artwork))
</script>

<template>
  <RouterLink
    :to="{ name: 'paint', params: { artworkId: artwork.id } }"
    class="artwork-card"
    :aria-label="`${artwork.title}，自由涂色`"
  >
    <span class="card-preview">
      <img
        v-if="artwork.thumbnail"
        class="card-thumb"
        :src="artwork.thumbnail"
        :alt="`${artwork.title} 预览`"
      >
      <PixelPreview v-else :level="artwork" />
    </span>
    <span class="card-body">
      <span class="card-title">{{ artwork.title }}</span>
      <span class="card-meta">{{ artwork.width }}×{{ artwork.height }} · {{ cellCount }} 格</span>
      <span v-if="artwork.tags.length > 0" class="card-tags">
        <span v-for="tag in artwork.tags" :key="tag" class="card-tag">{{ tag }}</span>
      </span>
    </span>
  </RouterLink>
</template>

<style scoped>
.artwork-card {
  display: flex;
  flex-direction: column;
  border: var(--border-pixel) solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  text-decoration: none;
  overflow: hidden;
  transition: border-color var(--transition-fast), transform var(--transition-fast),
    background-color var(--transition-fast);
}

.artwork-card:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-raised);
  transform: translateY(-2px);
}

.card-preview {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  padding: var(--space-2);
  background: var(--color-background);
}

.card-preview .pixel-preview {
  width: 100%;
}

.card-thumb {
  width: 100%;
  height: 100%;
  object-fit: contain;
  /* 缩略图就是像素格子图，放大要看到硬边，和涂色画面一致 */
  image-rendering: pixelated;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
}

.card-title {
  font-weight: 600;
  font-size: var(--font-card-title);
}

.card-meta {
  color: var(--color-text-muted);
  font-size: var(--font-meta);
  font-variant-numeric: tabular-nums;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.card-tag {
  padding: 0.1rem 0.55rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  font-size: var(--font-tag);
}
</style>