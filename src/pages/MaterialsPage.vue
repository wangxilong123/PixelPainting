<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ArtworkCard from '../components/ArtworkCard.vue'
import Pager from '../components/Pager.vue'
import PixelIcon from '../components/PixelIcon.vue'
import SearchBar from '../components/SearchBar.vue'
import { searchArtworks } from '../services/artworkService'

const query = ref('')
const page = ref(1)
const pageSize = 12

watch(query, () => {
  page.value = 1
})

const result = computed(() => searchArtworks(query.value, { page: page.value, pageSize }))
const totalPages = computed(() => Math.max(1, Math.ceil(result.value.total / pageSize)))
</script>

<template>
  <div class="materials-page">
    <div class="materials-head">
      <h2>素材库</h2>
      <p class="materials-intro">挑一幅像素图自由涂色：没有解锁顺序，计时可以关掉。</p>
    </div>

    <SearchBar v-model="query" />
    <p class="materials-count" aria-live="polite">共 {{ result.total }} 幅素材</p>

    <div v-if="result.items.length > 0" class="artwork-grid">
      <ArtworkCard v-for="artwork in result.items" :key="artwork.id" :artwork="artwork" />
    </div>
    <div v-else class="materials-empty">
      <PixelIcon name="search" />
      <p>没有找到匹配的素材，换个关键词试试。</p>
    </div>

    <Pager :page="result.page" :total-pages="totalPages" @change="page = $event" />
  </div>
</template>

<style scoped>
.materials-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.materials-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.materials-intro {
  margin: 0;
  color: var(--color-text-muted);
}

.materials-count {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.artwork-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}

.materials-empty {
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

.materials-empty .pixel-icon {
  width: 2rem;
  height: 2rem;
}

.materials-empty p {
  margin: 0;
}

@media (max-width: 1024px) {
  .artwork-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 560px) {
  .artwork-grid {
    grid-template-columns: 1fr;
  }
}
</style>