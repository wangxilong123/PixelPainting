<script setup lang="ts">
import { computed } from 'vue'
import type { Collection } from '../models/collection'
import { getCollectionById } from '../services/artworkService'
import PixelIcon from './PixelIcon.vue'
import PixelPreview from './PixelPreview.vue'

const props = defineProps<{ collection: Collection }>()

const members = computed(() => getCollectionById(props.collection.id)?.artworks ?? [])
const coverArtwork = computed(() => members.value[0])
const shownMembers = computed(() => members.value.slice(0, 4))
const extraCount = computed(() => Math.max(0, members.value.length - shownMembers.value.length))
</script>

<template>
  <RouterLink
    :to="{ name: 'collection-detail', params: { collectionId: collection.id } }"
    class="collection-card"
    :aria-label="`${collection.title}，${members.length} 幅素材`"
  >
    <span class="card-cover">
      <img
        v-if="collection.cover"
        class="cover-img"
        :src="collection.cover"
        :alt="`${collection.title} 封面`"
      >
      <PixelPreview v-else-if="coverArtwork" class="cover-preview" :level="coverArtwork" />
      <span class="cover-badge"><PixelIcon name="collections" /></span>
    </span>

    <span class="card-body">
      <span class="card-title">{{ collection.title }}</span>
      <span class="card-tags">
        <span v-for="tag in collection.tags" :key="tag" class="card-tag">{{ tag }}</span>
      </span>
      <span class="card-members">
        <span v-for="artwork in shownMembers" :key="artwork.id" class="member-thumb">
          <img v-if="artwork.thumbnail" :src="artwork.thumbnail" :alt="artwork.title">
          <PixelPreview v-else :level="artwork" />
        </span>
        <span v-if="extraCount > 0" class="member-extra">+{{ extraCount }}</span>
      </span>
      <span class="card-count">{{ members.length }} 幅素材</span>
    </span>

    <PixelIcon name="arrow-right" class="card-go" />
  </RouterLink>
</template>

<style scoped>
.collection-card {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-4);
  border: var(--border-pixel) solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  text-decoration: none;
  transition: border-color var(--transition-fast), transform var(--transition-fast),
    background-color var(--transition-fast);
}

.collection-card:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-raised);
  transform: translateY(-2px);
}

.card-cover {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
  width: 11rem;
  height: 11rem;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background);
  overflow: hidden;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  transition: transform var(--transition-fast);
}

.collection-card:hover .cover-img {
  transform: scale(1.05);
}

.cover-preview {
  width: 100%;
}

.cover-badge {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  display: inline-flex;
  padding: 0.3rem;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-background) 78%, transparent);
  color: var(--icon-collections);
}

.cover-badge .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
}

.card-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.card-title {
  font-size: var(--font-card-title);
  font-weight: 600;
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

.card-members {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.member-thumb {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0.2rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background);
  overflow: hidden;
}

.member-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.member-thumb .pixel-preview {
  width: 100%;
}

.member-extra {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: var(--font-meta);
  font-variant-numeric: tabular-nums;
}

.card-count {
  color: var(--color-text-muted);
  font-size: var(--font-meta);
  font-variant-numeric: tabular-nums;
}

.card-go {
  flex: none;
  width: var(--icon-size);
  height: var(--icon-size);
  color: var(--color-text-muted);
  transition: color var(--transition-fast), transform var(--transition-fast);
}

.collection-card:hover .card-go {
  color: var(--color-primary);
  transform: translateX(3px);
}

@media (max-width: 640px) {
  .collection-card {
    gap: var(--space-4);
    padding: var(--space-2);
  }

  .card-cover {
    width: 7rem;
    height: 7rem;
  }

  .card-go {
    display: none;
  }
}
</style>