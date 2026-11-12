<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ArtworkCard from '../components/ArtworkCard.vue'
import Pager from '../components/Pager.vue'
import PixelIcon from '../components/PixelIcon.vue'
import PixelPreview from '../components/PixelPreview.vue'
import SearchBar from '../components/SearchBar.vue'
import { artworkMatchesQuery, getCollectionById } from '../services/artworkService'

const route = useRoute()
const query = ref('')
const page = ref(1)
const pageSize = 12

const collectionId = computed(() => String(route.params.collectionId ?? ''))
const data = computed(() => getCollectionById(collectionId.value))
const artworks = computed(() => data.value?.artworks ?? [])
const filtered = computed(() => artworks.value.filter((artwork) => artworkMatchesQuery(artwork, query.value)))
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

watch(query, () => {
  page.value = 1
})

// 合集之间切换时组件会被复用，搜索词和页码要跟着重置
watch(collectionId, () => {
  query.value = ''
  page.value = 1
})
</script>

<template>
  <div v-if="!data" class="detail-missing">
    <PixelIcon name="warn" />
    <h2>未找到这个合集</h2>
    <p>它可能已被移除，回到合集列表看看别的吧。</p>
    <RouterLink class="detail-back-link" :to="{ name: 'collections' }">返回合集</RouterLink>
  </div>

  <div v-else class="collection-detail">
    <RouterLink class="detail-back" :to="{ name: 'collections' }">
      <PixelIcon name="arrow-left" />
      <span>返回合集</span>
    </RouterLink>

    <div class="detail-head">
      <span class="detail-cover">
        <img
          v-if="data.collection.cover"
          :src="data.collection.cover"
          :alt="`${data.collection.title} 封面`"
        >
        <PixelPreview v-else-if="artworks[0]" :level="artworks[0]" />
      </span>
      <span class="detail-heading">
        <h2>{{ data.collection.title }}</h2>
        <span class="detail-tags">
          <span v-for="tag in data.collection.tags" :key="tag" class="detail-tag">{{ tag }}</span>
        </span>
        <span class="detail-total">{{ artworks.length }} 幅素材</span>
      </span>
    </div>

    <SearchBar v-model="query" />
    <p class="detail-count" aria-live="polite">共 {{ filtered.length }} 幅素材</p>

    <div v-if="paged.length > 0" class="artwork-grid">
      <ArtworkCard v-for="artwork in paged" :key="artwork.id" :artwork="artwork" />
    </div>
    <div v-else class="detail-empty">
      <PixelIcon name="search" />
      <p>这个合集里没有匹配的素材，换个关键词试试。</p>
    </div>

    <Pager :page="page" :total-pages="totalPages" @change="page = $event" />
  </div>
</template>

<style scoped>
.collection-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.detail-back {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  align-self: flex-start;
  color: var(--color-text-muted);
  font-size: var(--font-meta);
  text-decoration: none;
  transition: color var(--transition-fast);
}

.detail-back:hover {
  color: var(--color-primary);
}

.detail-back .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
}

.detail-head {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.detail-cover {
  display: grid;
  flex: none;
  place-items: center;
  width: 5rem;
  height: 5rem;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background);
  overflow: hidden;
}

.detail-cover img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.detail-cover .pixel-preview {
  width: 100%;
}

.detail-heading {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.detail-heading h2 {
  font-size: var(--font-page-title);
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.detail-tag {
  padding: 0.1rem 0.55rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  font-size: var(--font-tag);
}

.detail-total {
  color: var(--color-text-muted);
  font-size: var(--font-meta);
  font-variant-numeric: tabular-nums;
}

.detail-count {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-meta);
}

.artwork-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}

.detail-empty,
.detail-missing {
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

.detail-missing {
  border-style: solid;
  background: var(--color-surface);
}

.detail-missing h2 {
  font-size: var(--font-page-title);
  color: var(--color-text);
}

.detail-missing p,
.detail-empty p {
  margin: 0;
}

.detail-empty .pixel-icon,
.detail-missing .pixel-icon {
  width: 2rem;
  height: 2rem;
}

.detail-missing .pixel-icon {
  color: var(--icon-danger);
}

.detail-back-link {
  color: var(--color-primary);
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