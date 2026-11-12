<script setup lang="ts">
import { computed, ref } from 'vue'
import CollectionCard from '../components/CollectionCard.vue'
import PixelIcon from '../components/PixelIcon.vue'
import SearchBar from '../components/SearchBar.vue'
import { searchCollections } from '../services/artworkService'

const query = ref('')
const collections = computed(() => searchCollections(query.value))
</script>

<template>
  <div class="collections-page">
    <div class="collections-head">
      <h2>合集</h2>
      <p class="collections-intro">按主题策展的像素图分组，挑一个合集开始涂色。</p>
    </div>

    <SearchBar v-model="query" />
    <p class="collections-count" aria-live="polite">共 {{ collections.length }} 个合集</p>

    <div v-if="collections.length > 0" class="collection-list">
      <CollectionCard v-for="collection in collections" :key="collection.id" :collection="collection" />
    </div>
    <div v-else class="collections-empty">
      <PixelIcon name="search" />
      <p>没有找到匹配的合集，换个关键词试试。</p>
    </div>
  </div>
</template>

<style scoped>
.collections-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.collections-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.collections-head h2 {
  font-size: var(--font-page-title);
}

.collections-intro {
  margin: 0;
  color: var(--color-text-muted);
}

.collections-count {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-meta);
}

.collection-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* 逐行错峰入场，减弱动态效果时由 global.css 统一压掉 */
.collection-list > * {
  animation: collection-rise 320ms ease-out both;
}

.collection-list > *:nth-child(2) { animation-delay: 60ms; }
.collection-list > *:nth-child(3) { animation-delay: 120ms; }
.collection-list > *:nth-child(4) { animation-delay: 180ms; }
.collection-list > *:nth-child(5) { animation-delay: 240ms; }

@keyframes collection-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.collections-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-8);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  text-align: center;
}

.collections-empty .pixel-icon {
  width: 2rem;
  height: 2rem;
}

.collections-empty p {
  margin: 0;
}
</style>