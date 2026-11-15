<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import ArtworkCard from '../components/ArtworkCard.vue'
import ExportDialog from '../components/ExportDialog.vue'
import Pager from '../components/Pager.vue'
import PixelIcon from '../components/PixelIcon.vue'
import SearchBar from '../components/SearchBar.vue'
import UploadDialog from '../components/UploadDialog.vue'
import type { PixelArtwork } from '../models/artwork'
import { artworkMatchesQuery } from '../services/artworkService'
import {
  deleteUserArtwork,
  getUserArtwork,
  listUserArtworks,
  saveUserArtwork,
  storageNotice,
} from '../services/artworkStorage'

const works = ref<PixelArtwork[]>([])
const loading = ref(true)
const query = ref('')
const page = ref(1)
const pageSize = 12
const dialogOpen = ref(false)
const exportOpen = ref(false)
const exportTarget = shallowRef<PixelArtwork | null>(null)
const confirmId = ref<string | null>(null)
const undoItem = shallowRef<{ artwork: PixelArtwork; original: Blob } | null>(null)

let confirmTimer: number | undefined
let undoTimer: number | undefined

const filtered = computed(() => works.value.filter((artwork) => artworkMatchesQuery(artwork, query.value)))
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const paged = computed(() => {
  const start = (page.value - 1) * pageSize
  return filtered.value.slice(start, start + pageSize)
})

watch(query, () => {
  page.value = 1
})
watch(totalPages, (pages) => {
  if (page.value > pages) page.value = pages
})

onMounted(async () => {
  works.value = await listUserArtworks()
  loading.value = false
})

onBeforeUnmount(() => {
  clearTimeout(confirmTimer)
  clearTimeout(undoTimer)
})

function onSaved(artwork: PixelArtwork): void {
  works.value = [artwork, ...works.value]
  query.value = ''
  page.value = 1
}

function openExport(artwork: PixelArtwork): void {
  exportTarget.value = artwork
  exportOpen.value = true
}

function requestDelete(id: string): void {
  if (confirmId.value === id) {
    void doDelete(id)
    return
  }
  confirmId.value = id
  clearTimeout(confirmTimer)
  confirmTimer = window.setTimeout(() => {
    confirmId.value = null
  }, 3000)
}

async function doDelete(id: string): Promise<void> {
  clearTimeout(confirmTimer)
  confirmId.value = null
  // 先取原图再删，撤销时能把作品和原图一起恢复
  const stored = await getUserArtwork(id)
  await deleteUserArtwork(id)
  works.value = works.value.filter((artwork) => artwork.id !== id)
  if (!stored) return
  undoItem.value = { artwork: stored.artwork, original: stored.original }
  clearTimeout(undoTimer)
  undoTimer = window.setTimeout(() => {
    undoItem.value = null
  }, 6000)
}

async function undoDelete(): Promise<void> {
  const item = undoItem.value
  if (!item) return
  clearTimeout(undoTimer)
  undoItem.value = null
  await saveUserArtwork(item.artwork, item.original)
  works.value = [item.artwork, ...works.value]
}
</script>

<template>
  <div class="studio-page">
    <div class="studio-head">
      <h2>制作像素图</h2>
      <p class="studio-intro">上传一张图片，把它变成可以涂色的像素作品，全部保存在这台设备的浏览器里。</p>
    </div>

    <p v-if="storageNotice" class="studio-notice" role="alert">
      <PixelIcon name="warn" />
      <span>{{ storageNotice }}</span>
    </p>

    <div class="studio-toolbar">
      <span class="studio-count" aria-live="polite">已制作 {{ works.length }} 幅</span>
      <button type="button" class="primary studio-add" @click="dialogOpen = true">
        <PixelIcon name="studio" />
        <span>添加图片</span>
      </button>
    </div>

    <p v-if="loading" class="studio-loading" aria-live="polite">正在加载作品…</p>

    <template v-else-if="works.length > 0">
      <SearchBar v-model="query" placeholder="搜索作品名称或标签" label="搜索作品" />
      <p class="studio-count" aria-live="polite">共 {{ filtered.length }} 幅作品</p>

      <div v-if="paged.length > 0" class="artwork-grid">
        <div v-for="artwork in paged" :key="artwork.id" class="studio-item">
          <ArtworkCard :artwork="artwork" />
          <div class="studio-tools">
            <button
              type="button"
              class="studio-download"
              :aria-label="`下载《${artwork.title}》`"
              @click="openExport(artwork)"
            >
              <PixelIcon name="download" />
            </button>
            <button
              type="button"
              class="studio-delete"
              :class="{ confirm: confirmId === artwork.id }"
              :aria-label="confirmId === artwork.id ? `确认删除《${artwork.title}》` : `删除《${artwork.title}》`"
              @click="requestDelete(artwork.id)"
            >
              <PixelIcon :name="confirmId === artwork.id ? 'warn' : 'close'" />
              <span v-if="confirmId === artwork.id">确认删除</span>
            </button>
          </div>
        </div>
      </div>
      <div v-else class="studio-empty">
        <PixelIcon name="search" />
        <p>没有找到匹配的作品，换个关键词试试。</p>
      </div>

      <Pager :page="page" :total-pages="totalPages" @change="page = $event" />
    </template>

    <div v-else class="studio-empty studio-empty-first">
      <PixelIcon name="studio" :size="48" />
      <p>还没有自己的像素图。上传一张图片，把它变成可以涂色的像素作品。</p>
      <button type="button" class="primary" @click="dialogOpen = true">
        <PixelIcon name="studio" />
        <span>添加图片</span>
      </button>
    </div>

    <div v-if="undoItem" class="studio-undo" role="status">
      <span>已删除《{{ undoItem.artwork.title }}》</span>
      <button type="button" @click="undoDelete">
        <PixelIcon name="undo" />
        <span>撤销</span>
      </button>
    </div>

    <UploadDialog :open="dialogOpen" @close="dialogOpen = false" @saved="onSaved" />

    <ExportDialog :open="exportOpen" :artwork="exportTarget" @close="exportOpen = false" />
  </div>
</template>

<style scoped>
.studio-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.studio-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.studio-head h2 {
  font-size: var(--font-page-title);
}

.studio-intro {
  margin: 0;
  color: var(--color-text-muted);
}

.studio-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-sm);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.studio-notice .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
  color: inherit;
}

.studio-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.studio-count {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-meta);
  font-variant-numeric: tabular-nums;
}

.studio-add,
.studio-empty-first button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1.1rem;
  border: 2px solid var(--color-primary);
  border-radius: var(--radius-lg);
  background: var(--color-primary);
  color: var(--color-on-primary);
  font: inherit;
  font-size: var(--action-font);
  font-weight: 600;
  cursor: pointer;
  transition: filter var(--transition-fast);
}

.studio-add:hover,
.studio-empty-first button:hover {
  filter: brightness(1.08);
}

.studio-add .pixel-icon,
.studio-empty-first button .pixel-icon {
  width: var(--icon-size);
  height: var(--icon-size);
  color: inherit;
}

.studio-loading {
  margin: 0;
  color: var(--color-text-muted);
}

.artwork-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}

.studio-item {
  position: relative;
}

.studio-tools {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.studio-download,
.studio-delete {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-badge-scrim);
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--font-tag);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast),
    background-color var(--transition-fast);
}

.studio-download:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.studio-delete:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.studio-delete.confirm {
  border-color: var(--color-danger);
  background: var(--color-danger);
  color: var(--color-on-danger);
  font-weight: 600;
}

.studio-download .pixel-icon,
.studio-delete .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
  color: inherit;
}

.studio-empty {
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

.studio-empty .pixel-icon {
  width: 2rem;
  height: 2rem;
}

.studio-empty p {
  margin: 0;
}

.studio-empty-first .pixel-icon {
  width: 3rem;
  height: 3rem;
  color: var(--icon-studio);
}

.studio-undo {
  position: fixed;
  bottom: var(--space-6);
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0.6rem 1rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-surface-raised);
  color: var(--color-text);
  box-shadow: var(--shadow-overlay);
}

.studio-undo button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.8rem;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-primary);
  font: inherit;
  font-size: var(--font-meta);
  cursor: pointer;
}

.studio-undo button:hover {
  background: var(--color-primary-soft);
}

.studio-undo .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
  color: inherit;
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

  .studio-undo {
    left: var(--space-4);
    right: var(--space-4);
    bottom: var(--space-4);
    transform: none;
    justify-content: space-between;
  }
}
</style>