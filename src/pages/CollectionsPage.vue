<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import CollectionCard from '../components/CollectionCard.vue'
import CollectionEditor from '../components/CollectionEditor.vue'
import PixelIcon from '../components/PixelIcon.vue'
import SearchBar from '../components/SearchBar.vue'
import type { UserCollection } from '../models/collection'
import { getUserCollection, isUserCollection, searchCollections } from '../services/artworkService'
import {
  deleteUserCollection,
  loadUserCollections,
  restoreUserCollection,
} from '../services/collectionStorage'

const query = ref('')
const collections = computed(() => searchCollections(query.value))
const editorOpen = ref(false)
const editing = shallowRef<UserCollection | null>(null)
const confirmId = ref<string | null>(null)
const undoItem = shallowRef<UserCollection | null>(null)

let confirmTimer: number | undefined
let undoTimer: number | undefined

// 注册表在 collectionStorage 加载时已灌好；这里再同步一次，跨页改动后回来也是最新的
loadUserCollections()

onBeforeUnmount(() => {
  clearTimeout(confirmTimer)
  clearTimeout(undoTimer)
})

function openCreate(): void {
  editing.value = null
  editorOpen.value = true
}

function openEdit(id: string): void {
  editing.value = getUserCollection(id) ?? null
  editorOpen.value = true
}

function requestDelete(id: string): void {
  if (confirmId.value === id) {
    doDelete(id)
    return
  }
  confirmId.value = id
  clearTimeout(confirmTimer)
  confirmTimer = window.setTimeout(() => {
    confirmId.value = null
  }, 3000)
}

function doDelete(id: string): void {
  clearTimeout(confirmTimer)
  confirmId.value = null
  const removed = deleteUserCollection(id)
  if (!removed) return
  undoItem.value = removed
  clearTimeout(undoTimer)
  undoTimer = window.setTimeout(() => {
    undoItem.value = null
  }, 6000)
}

function undoDelete(): void {
  const item = undoItem.value
  if (!item) return
  clearTimeout(undoTimer)
  undoItem.value = null
  restoreUserCollection(item)
}
</script>

<template>
  <div class="collections-page">
    <div class="collections-head">
      <div class="collections-heading">
        <h2>合集</h2>
        <p class="collections-intro">按主题策展的像素图分组，也可以挑素材和自己的作品，做成专属合集。</p>
      </div>
      <button type="button" class="collections-add" @click="openCreate">
        <PixelIcon name="collections" />
        <span>新建合集</span>
      </button>
    </div>

    <SearchBar v-model="query" placeholder="搜索合集名称或标签" label="搜索合集" />
    <p class="collections-count" aria-live="polite">共 {{ collections.length }} 个合集</p>

    <div v-if="collections.length > 0" class="collection-list">
      <div v-for="collection in collections" :key="collection.id" class="collection-item">
        <CollectionCard :collection="collection" :mine="isUserCollection(collection.id)" />
        <span v-if="isUserCollection(collection.id)" class="collection-tools">
          <button
            type="button"
            class="collection-edit"
            :aria-label="`编辑《${collection.title}》`"
            @click="openEdit(collection.id)"
          >
            <PixelIcon name="studio" />
          </button>
          <button
            type="button"
            class="collection-delete"
            :class="{ confirm: confirmId === collection.id }"
            :aria-label="confirmId === collection.id ? `确认删除《${collection.title}》` : `删除《${collection.title}》`"
            @click="requestDelete(collection.id)"
          >
            <PixelIcon :name="confirmId === collection.id ? 'warn' : 'close'" />
            <span v-if="confirmId === collection.id">确认删除</span>
          </button>
        </span>
      </div>
    </div>
    <div v-else class="collections-empty">
      <PixelIcon name="search" />
      <p>没有找到匹配的合集，换个关键词试试。</p>
    </div>

    <div v-if="undoItem" class="collections-undo" role="status">
      <span>已删除《{{ undoItem.title }}》</span>
      <button type="button" @click="undoDelete">
        <PixelIcon name="undo" />
        <span>撤销</span>
      </button>
    </div>

    <CollectionEditor :open="editorOpen" :collection="editing" @close="editorOpen = false" />
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
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.collections-heading {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.collections-head h2 {
  font-size: var(--font-page-title);
}

.collections-intro {
  margin: 0;
  color: var(--color-text-muted);
}

.collections-add {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1.1rem;
  border: 2px solid var(--color-primary);
  border-radius: var(--radius-lg);
  background: var(--color-primary);
  color: var(--color-background);
  font: inherit;
  font-size: var(--action-font);
  font-weight: 600;
  cursor: pointer;
  transition: filter var(--transition-fast);
}

.collections-add:hover {
  filter: brightness(1.08);
}

.collections-add .pixel-icon {
  width: var(--icon-size);
  height: var(--icon-size);
  color: inherit;
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

.collection-item {
  position: relative;
}

.collection-tools {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  z-index: 2;
  display: inline-flex;
  gap: var(--space-2);
}

.collection-edit,
.collection-delete {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgb(17 17 27 / 80%);
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--font-tag);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast),
    background-color var(--transition-fast);
}

.collection-edit:hover {
  border-color: var(--color-focus);
  color: var(--color-focus);
}

.collection-delete:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.collection-delete.confirm {
  border-color: var(--color-danger);
  background: var(--color-danger);
  color: var(--color-background);
  font-weight: 600;
}

.collection-edit .pixel-icon,
.collection-delete .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
  color: inherit;
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

.collections-undo {
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
  box-shadow: 0 6px 24px rgb(0 0 0 / 45%);
}

.collections-undo button {
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

.collections-undo button:hover {
  background: rgb(255 204 102 / 12%);
}

.collections-undo .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
  color: inherit;
}

@media (max-width: 640px) {
  .collections-head {
    flex-direction: column;
  }

  .collections-undo {
    left: var(--space-4);
    right: var(--space-4);
    bottom: var(--space-4);
    transform: none;
    justify-content: space-between;
  }
}
</style>