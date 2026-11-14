<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PixelArtwork } from '../models/artwork'
import type { UserCollection } from '../models/collection'
import { artworkMatchesQuery, getAllArtworks, isUserArtwork } from '../services/artworkService'
import { saveUserCollection } from '../services/collectionStorage'
import PixelIcon from './PixelIcon.vue'
import PixelPreview from './PixelPreview.vue'
import SearchBar from './SearchBar.vue'

const props = defineProps<{ open: boolean; collection?: UserCollection | null }>()
const emit = defineEmits<{ close: []; saved: [collection: UserCollection] }>()

const title = ref('')
const tagsInput = ref('')
const selectedIds = ref<string[]>([])
const query = ref('')
const sourceFilter = ref<'all' | 'preset' | 'user'>('all')
const error = ref<string | null>(null)

const editing = computed(() => props.collection ?? null)
const allArtworks = computed(() => getAllArtworks())
const selectedSet = computed(() => new Set(selectedIds.value))
const presetCount = computed(() => allArtworks.value.filter((artwork) => !isUserArtwork(artwork.id)).length)
const userCount = computed(() => allArtworks.value.length - presetCount.value)

const selectedArtworks = computed(() => {
  const byId = new Map(allArtworks.value.map((artwork) => [artwork.id, artwork]))
  return selectedIds.value
    .map((id) => byId.get(id))
    .filter((artwork): artwork is PixelArtwork => artwork !== undefined)
})

const pickerArtworks = computed(() => {
  const bySource = sourceFilter.value === 'all'
    ? allArtworks.value
    : allArtworks.value.filter((artwork) =>
      sourceFilter.value === 'user' ? isUserArtwork(artwork.id) : !isUserArtwork(artwork.id))
  return bySource.filter((artwork) => artworkMatchesQuery(artwork, query.value))
})

const parsedTags = computed(() => {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const raw of tagsInput.value.split(/[,，]/)) {
    const tag = raw.trim()
    if (tag && !seen.has(tag)) {
      seen.add(tag)
      tags.push(tag)
    }
    if (tags.length >= 6) break
  }
  return tags
})

const canSave = computed(() => title.value.trim() !== '' && selectedIds.value.length > 0)
const hintText = computed(() => {
  if (title.value.trim() === '') return '先给合集起个名字'
  if (selectedIds.value.length === 0) return '至少选一幅作品'
  return `已选 ${selectedIds.value.length} 幅，第一幅作封面`
})

function toggle(id: string): void {
  error.value = null
  selectedIds.value = selectedSet.value.has(id)
    ? selectedIds.value.filter((entry) => entry !== id)
    : [...selectedIds.value, id]
}

function move(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= selectedIds.value.length) return
  const next = [...selectedIds.value]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  selectedIds.value = next
}

function removeAt(index: number): void {
  selectedIds.value = selectedIds.value.filter((_, entry) => entry !== index)
}

function save(): void {
  if (!canSave.value) return
  error.value = null
  try {
    const record = saveUserCollection({
      id: editing.value?.id,
      title: title.value,
      tags: parsedTags.value,
      artworkIds: selectedIds.value,
    })
    emit('saved', record)
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败，请重试'
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(() => props.open, (open) => {
  if (open) {
    title.value = props.collection?.title ?? ''
    tagsInput.value = props.collection?.tags.join(', ') ?? ''
    selectedIds.value = [...(props.collection?.artworkIds ?? [])]
    query.value = ''
    sourceFilter.value = 'all'
    error.value = null
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
}, { immediate: true })

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div v-if="open" class="editor-backdrop" @click.self="emit('close')">
    <div
      role="dialog"
      aria-modal="true"
      :aria-label="editing ? '编辑合集' : '新建合集'"
      class="editor-dialog"
    >
      <header class="editor-head">
        <h2>{{ editing ? '编辑合集' : '新建合集' }}</h2>
        <button type="button" class="editor-close" aria-label="关闭" @click="emit('close')">
          <PixelIcon name="close" />
        </button>
      </header>

      <div class="editor-fields">
        <label class="field">
          <span class="field-label">名称</span>
          <input v-model="title" type="text" maxlength="40" placeholder="给合集起个名字">
        </label>
        <label class="field">
          <span class="field-label">标签（逗号分隔，最多 6 个）</span>
          <input v-model="tagsInput" type="text" placeholder="主题, 心情">
        </label>
      </div>

      <div class="editor-selected">
        <div class="selected-head">
          <span class="field-label">已选作品（{{ selectedIds.length }}）</span>
          <button
            v-if="selectedIds.length > 0"
            type="button"
            class="selected-clear"
            @click="selectedIds = []"
          >
            清空
          </button>
        </div>
        <ol v-if="selectedArtworks.length > 0" class="selected-strip">
          <li v-for="(artwork, index) in selectedArtworks" :key="artwork.id" class="selected-item">
            <span class="selected-order" aria-hidden="true">{{ index + 1 }}</span>
            <span class="selected-thumb">
              <img v-if="artwork.thumbnail" :src="artwork.thumbnail" :alt="artwork.title">
              <PixelPreview v-else :level="artwork" />
            </span>
            <span class="selected-title">{{ artwork.title }}</span>
            <span v-if="index === 0" class="selected-cover-tag">封面</span>
            <span class="selected-actions">
              <button
                type="button"
                :disabled="index === 0"
                :aria-label="`把《${artwork.title}》前移`"
                @click="move(index, -1)"
              >
                <PixelIcon name="arrow-left" />
              </button>
              <button
                type="button"
                :disabled="index === selectedArtworks.length - 1"
                :aria-label="`把《${artwork.title}》后移`"
                @click="move(index, 1)"
              >
                <PixelIcon name="arrow-right" />
              </button>
              <button
                type="button"
                :aria-label="`移除《${artwork.title}》`"
                @click="removeAt(index)"
              >
                <PixelIcon name="close" />
              </button>
            </span>
          </li>
        </ol>
        <p v-else class="selected-empty">从下面点选作品加入合集，点选顺序就是展示顺序。</p>
      </div>

      <div class="editor-picker">
        <SearchBar v-model="query" placeholder="搜索作品名称或标签" label="搜索可选作品" />
        <div class="picker-chips" role="group" aria-label="按来源筛选">
          <button
            type="button"
            class="picker-chip"
            :class="{ active: sourceFilter === 'all' }"
            :aria-pressed="sourceFilter === 'all'"
            @click="sourceFilter = 'all'"
          >
            全部 {{ allArtworks.length }}
          </button>
          <button
            type="button"
            class="picker-chip"
            :class="{ active: sourceFilter === 'preset' }"
            :aria-pressed="sourceFilter === 'preset'"
            @click="sourceFilter = 'preset'"
          >
            素材 {{ presetCount }}
          </button>
          <button
            type="button"
            class="picker-chip"
            :class="{ active: sourceFilter === 'user' }"
            :aria-pressed="sourceFilter === 'user'"
            @click="sourceFilter = 'user'"
          >
            我的作品 {{ userCount }}
          </button>
        </div>

        <div class="picker-scroll">
          <div v-if="pickerArtworks.length > 0" class="picker-grid">
            <button
              v-for="artwork in pickerArtworks"
              :key="artwork.id"
              type="button"
              class="picker-tile"
              :class="{ selected: selectedSet.has(artwork.id) }"
              :aria-pressed="selectedSet.has(artwork.id)"
              :aria-label="`${artwork.title}，${isUserArtwork(artwork.id) ? '我的作品' : '素材'}`"
              @click="toggle(artwork.id)"
            >
              <span class="tile-thumb">
                <img v-if="artwork.thumbnail" :src="artwork.thumbnail" :alt="artwork.title">
                <PixelPreview v-else :level="artwork" />
                <span v-if="selectedSet.has(artwork.id)" class="tile-order" aria-hidden="true">
                  {{ selectedIds.indexOf(artwork.id) + 1 }}
                </span>
              </span>
              <span class="tile-title">{{ artwork.title }}</span>
              <span class="tile-source">{{ isUserArtwork(artwork.id) ? '我的作品' : '素材' }}</span>
            </button>
          </div>
          <p v-else class="picker-empty">没有找到匹配的作品，换个关键词试试。</p>
        </div>
      </div>

      <p v-if="error" class="editor-error" role="alert">{{ error }}</p>

      <footer class="editor-actions">
        <span class="editor-hint" aria-live="polite">{{ hintText }}</span>
        <button type="button" @click="emit('close')">取消</button>
        <button type="button" class="primary" :disabled="!canSave" @click="save">
          <PixelIcon name="check" />
          <span>{{ editing ? '保存修改' : '创建合集' }}</span>
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.editor-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgb(0 0 0 / 70%);
  overflow-y: auto;
}

.editor-dialog {
  /* 尺寸旋钮：对话框最大宽度与成员选择区高度，想调 picking 区域大小改这里 */
  --editor-width: 56rem;
  --editor-picker-height: 20rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: min(var(--editor-width), 100%);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  padding: var(--space-6);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.editor-head h2 {
  font-size: var(--font-page-title);
}

.editor-close {
  display: inline-flex;
  padding: 0.4rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color var(--transition-fast), background-color var(--transition-fast);
}

.editor-close:hover {
  background: var(--color-surface-raised);
  color: var(--color-text);
}

.editor-close .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
}

.editor-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.field-label {
  color: var(--color-text-muted);
  font-size: var(--font-meta);
}

.field input[type="text"] {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font: inherit;
}

.field input[type="text"]:focus-visible {
  border-color: var(--color-focus);
  outline: none;
}

.editor-selected {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.selected-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.selected-clear {
  padding: 0.1rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--font-tag);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.selected-clear:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.selected-strip {
  display: flex;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2);
  list-style: none;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background);
  overflow-x: auto;
}

.selected-item {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.selected-order {
  display: grid;
  place-items: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-background);
  font-size: var(--font-tag);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.selected-thumb {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0.15rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background);
  overflow: hidden;
}

.selected-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.selected-thumb .pixel-preview {
  width: 100%;
}

.selected-title {
  max-width: 7rem;
  overflow: hidden;
  font-size: var(--font-tag);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-cover-tag {
  padding: 0 0.4rem;
  border: 1px solid var(--color-primary);
  border-radius: 999px;
  color: var(--color-primary);
  font-size: var(--font-tag);
}

.selected-actions {
  display: inline-flex;
  gap: 0.15rem;
}

.selected-actions button {
  display: inline-flex;
  padding: 0.2rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.selected-actions button:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  color: var(--color-text);
}

.selected-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.selected-actions .pixel-icon {
  width: var(--icon-badge-size);
  height: var(--icon-badge-size);
}

.selected-empty {
  margin: 0;
  padding: var(--space-2);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: var(--font-meta);
}

.editor-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.picker-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.picker-chip {
  padding: 0.25rem 0.8rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--font-chip);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast),
    background-color var(--transition-fast);
}

.picker-chip:hover {
  border-color: var(--color-border-strong);
  color: var(--color-text);
}

.picker-chip.active {
  border-color: var(--color-primary);
  background: rgb(255 204 102 / 12%);
  color: var(--color-primary);
  font-weight: 600;
}

.picker-scroll {
  max-height: var(--editor-picker-height);
  overflow-y: auto;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background);
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  gap: var(--space-2);
}

.picker-tile {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: var(--space-2);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--transition-fast), background-color var(--transition-fast),
    transform var(--transition-fast);
}

.picker-tile:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-raised);
  transform: translateY(-1px);
}

.picker-tile.selected {
  border-color: var(--color-primary);
  background: rgb(255 204 102 / 8%);
}

.tile-thumb {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  padding: 0.2rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background);
  overflow: hidden;
}

.tile-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.tile-thumb .pixel-preview {
  width: 100%;
}

.tile-order {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  display: grid;
  place-items: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-background);
  font-size: var(--font-tag);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.tile-title {
  overflow: hidden;
  font-size: var(--font-tag);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-source {
  color: var(--color-text-muted);
  font-size: var(--font-tag);
}

.picker-empty {
  margin: 0;
  padding: var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--font-meta);
  text-align: center;
}

.editor-error {
  margin: 0;
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-sm);
  background: rgb(248 113 113 / 10%);
  color: var(--color-danger);
  font-size: var(--font-meta);
}

.editor-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-4);
}

.editor-hint {
  margin-right: auto;
  color: var(--color-text-muted);
  font-size: var(--font-meta);
}

.editor-actions button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1.1rem;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: var(--action-font);
  cursor: pointer;
  transition: border-color var(--transition-fast), background-color var(--transition-fast);
}

.editor-actions button:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  background: var(--color-surface-raised);
}

.editor-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.editor-actions .pixel-icon {
  width: var(--icon-size);
  height: var(--icon-size);
}

.editor-actions button.primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-background);
  font-weight: 600;
}

.editor-actions button.primary .pixel-icon {
  color: inherit;
}

.editor-actions button.primary:hover:not(:disabled) {
  background: var(--color-primary);
  filter: brightness(1.08);
}

@media (max-width: 640px) {
  .editor-dialog {
    --editor-picker-height: 15rem;
    padding: var(--space-4);
  }

  .editor-fields {
    grid-template-columns: 1fr;
  }

  .editor-actions {
    flex-wrap: wrap;
  }

  .editor-hint {
    flex-basis: 100%;
    margin-right: 0;
  }
}
</style>