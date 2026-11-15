<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import PixelIcon from './PixelIcon.vue'
import ExportDialog from './ExportDialog.vue'
import type { PixelArtwork } from '../models/artwork'
import type { Level, LevelParts } from '../models/level'
import { newUserArtworkId, saveUserArtwork } from '../services/artworkStorage'
import { imageToLevel, type PixelSource } from '../services/imageToLevel'
import { blobToPixelSource } from '../services/imageSource'
import { getInteractiveCellCount, getPartRects } from '../services/levelService'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; saved: [artwork: PixelArtwork] }>()

const fileInput = ref<HTMLInputElement | null>(null)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const source = shallowRef<PixelSource | null>(null)
const file = ref<File | null>(null)
const preview = shallowRef<Level | null>(null)
const thumbnail = ref('')
const title = ref('')
const tagsInput = ref('')
const gridWidth = ref(64)
const gridDraft = ref(String(gridWidth.value))
const colorCap = ref(24)
const partsMode = ref<'auto' | 'none' | '2' | '3'>('auto')
const busy = ref(false)
const saving = ref(false)
const dragOver = ref(false)
const error = ref<string | null>(null)
const lightboxOpen = ref(false)
const exportOpen = ref(false)

// 预览画布的内禀渲染基准：按最长边缩到这个像素量级，再交给 CSS 填满预览框，
// 配合 image-rendering: pixelated 放大也不糊；想更精细调大这个数即可
const PREVIEW_RENDER_SIZE = 640

const GRID_MIN = 16
const GRID_MAX = 256

const actualWidth = computed(() => (source.value ? Math.min(gridWidth.value, source.value.width) : 0))
const effectiveParts = computed<LevelParts | undefined>(() => {
  if (partsMode.value === '2') return { cols: 2, rows: 2 }
  if (partsMode.value === '3') return { cols: 3, rows: 3 }
  if (partsMode.value === 'none') return undefined
  return actualWidth.value > 64 ? { cols: 3, rows: 3 } : undefined
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
const stats = computed(() => {
  const p = preview.value
  return p ? `${p.width}×${p.height} · ${getInteractiveCellCount(p)} 格 · ${p.palette.length} 色` : ''
})

let debounceTimer: number | undefined

function makeThumbnail(level: Level): string {
  const canvas = document.createElement('canvas')
  canvas.width = level.width
  canvas.height = level.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const hexOf = new Map(level.palette.map((color) => [color.id, color.hex]))
  for (let i = 0; i < level.cells.length; i += 1) {
    const id = level.cells[i]
    if (id === 0) continue
    ctx.fillStyle = hexOf.get(id) ?? '#000000'
    ctx.fillRect(i % level.width, Math.floor(i / level.width), 1, 1)
  }
  return canvas.toDataURL('image/png')
}

function recompute(): void {
  if (!source.value) {
    preview.value = null
    return
  }
  try {
    const level = imageToLevel(source.value, {
      id: 'preview',
      title: title.value.trim() || '未命名作品',
      category: 'other',
      difficulty: 1,
      maxWidth: gridWidth.value,
      colorCap: colorCap.value,
      parts: effectiveParts.value,
      tags: parsedTags.value,
    })
    preview.value = level
    thumbnail.value = makeThumbnail(level)
    error.value = null
  } catch (e) {
    preview.value = null
    thumbnail.value = ''
    error.value = e instanceof Error ? e.message : '转换失败，请调整参数'
  }
}

function drawPreview(level: Level): void {
  const canvas = previewCanvas.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  const cell = Math.max(1, Math.round(PREVIEW_RENDER_SIZE / Math.max(level.width, level.height)))
  canvas.width = level.width * cell
  canvas.height = level.height * cell
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const hexOf = new Map(level.palette.map((color) => [color.id, color.hex]))
  for (let i = 0; i < level.cells.length; i += 1) {
    const id = level.cells[i]
    if (id === 0) continue
    ctx.fillStyle = hexOf.get(id) ?? '#000000'
    ctx.fillRect((i % level.width) * cell, Math.floor(i / level.width) * cell, cell, cell)
  }
  const rects = getPartRects(level)
  if (rects.length > 1) {
    ctx.strokeStyle = 'rgb(255 255 255 / 55%)'
    ctx.lineWidth = 1
    for (const rect of rects) {
      ctx.strokeRect(rect.x * cell + 0.5, rect.y * cell + 0.5, rect.width * cell - 1, rect.height * cell - 1)
    }
  }
}

watch(preview, async (level) => {
  await nextTick()
  if (level) drawPreview(level)
})

// 拖动滑块时合并连续触发，停手 120ms 后再重算，避免每像素都跑一遍量化
watch([gridWidth, colorCap, partsMode], () => {
  if (!source.value) return
  clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(recompute, 120)
})

watch(actualWidth, (width) => {
  if (width > 64 && partsMode.value === 'none') partsMode.value = 'auto'
})

// 滑杆改动时把数字框同步成当前值；手动输入走 commitGrid 夹取后再写回 gridWidth
watch(gridWidth, (value) => {
  gridDraft.value = String(value)
})

async function onFile(next: File | null): Promise<void> {
  if (!next) return
  error.value = null
  busy.value = true
  try {
    const decoded = await blobToPixelSource(next)
    source.value = decoded
    file.value = next
    title.value = next.name.replace(/\.[^.]+$/, '') || '未命名作品'
    gridWidth.value = 64
    gridDraft.value = String(gridWidth.value)
    colorCap.value = 24
    partsMode.value = 'auto'
    recompute()
  } catch (e) {
    source.value = null
    file.value = null
    preview.value = null
    error.value = e instanceof Error ? e.message : '无法读取图片'
  } finally {
    busy.value = false
  }
}

function onInputChange(event: Event): void {
  const input = event.target as HTMLInputElement
  void onFile(input.files?.[0] ?? null)
  input.value = ''
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  dragOver.value = false
  void onFile(event.dataTransfer?.files?.[0] ?? null)
}

async function save(): Promise<void> {
  const p = preview.value
  if (!p || !file.value || saving.value) return
  saving.value = true
  error.value = null
  try {
    const artwork: PixelArtwork = {
      id: newUserArtworkId(),
      title: title.value.trim() || '未命名作品',
      tags: parsedTags.value,
      width: p.width,
      height: p.height,
      palette: p.palette,
      cells: p.cells,
      ...(p.parts ? { parts: p.parts } : {}),
      ...(thumbnail.value ? { thumbnail: thumbnail.value } : {}),
    }
    await saveUserArtwork(artwork, file.value)
    emit('saved', artwork)
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败，请重试'
  } finally {
    saving.value = false
  }
}

function reset(): void {
  clearTimeout(debounceTimer)
  source.value = null
  file.value = null
  preview.value = null
  thumbnail.value = ''
  title.value = ''
  tagsInput.value = ''
  gridWidth.value = 64
  gridDraft.value = String(gridWidth.value)
  colorCap.value = 24
  partsMode.value = 'auto'
  error.value = null
  busy.value = false
  saving.value = false
  dragOver.value = false
  lightboxOpen.value = false
  exportOpen.value = false
}

function commitGrid(): void {
  const parsed = Number.parseInt(gridDraft.value, 10)
  const next = Number.isFinite(parsed) ? Math.min(GRID_MAX, Math.max(GRID_MIN, parsed)) : gridWidth.value
  gridWidth.value = next
  gridDraft.value = String(next)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (exportOpen.value) return
  if (lightboxOpen.value) {
    lightboxOpen.value = false
    return
  }
  emit('close')
}

watch(() => props.open, (open) => {
  if (open) {
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('keydown', onKeydown)
    reset()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  clearTimeout(debounceTimer)
})
</script>

<template>
  <div v-if="open" class="upload-backdrop" @click.self="emit('close')">
    <div role="dialog" aria-modal="true" aria-label="制作像素图" class="upload-dialog">
      <header class="upload-head">
        <h2>制作像素图</h2>
        <button type="button" class="upload-close" aria-label="关闭" @click="emit('close')">
          <PixelIcon name="close" />
        </button>
      </header>

      <div v-if="!source" class="upload-pick">
        <button
          type="button"
          class="dropzone"
          :class="{ dragover: dragOver }"
          @click="fileInput?.click()"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop="onDrop"
        >
          <PixelIcon name="studio" :size="40" />
          <span class="dropzone-title">点击选择或拖入图片</span>
          <span class="dropzone-hint">支持 PNG、JPG、WebP，透明背景会保留为空格</span>
        </button>
        <p v-if="busy" class="upload-status" aria-live="polite">正在读取图片…</p>
      </div>

      <div v-else class="upload-body">
        <div class="upload-preview">
          <div class="preview-frame">
            <canvas ref="previewCanvas" class="preview-canvas" aria-label="像素图预览" />
            <button
              v-if="preview && thumbnail"
              type="button"
              class="preview-expand"
              aria-label="查看像素图大图"
              title="查看像素图大图"
              @click="lightboxOpen = true"
            >
              <PixelIcon name="expand" />
            </button>
          </div>
          <p class="preview-stats" aria-live="polite">{{ stats }}</p>
          <p v-if="source && actualWidth < source.width" class="preview-note">
            原图 {{ source.width }}×{{ source.height }}，已按格数上限缩到 {{ actualWidth }} 宽
          </p>
          <button type="button" class="change-image" @click="fileInput?.click()">
            <PixelIcon name="replay" />
            <span>换一张图片</span>
          </button>
          <button type="button" class="download-image" :disabled="!preview" @click="exportOpen = true">
            <PixelIcon name="download" />
            <span>下载像素图</span>
          </button>
        </div>

        <div class="upload-controls">
          <label class="field">
            <span class="field-label">标题</span>
            <input v-model="title" type="text" maxlength="40" placeholder="给作品起个名字">
          </label>
          <label class="field">
            <span class="field-label">标签（逗号分隔，最多 6 个）</span>
            <input v-model="tagsInput" type="text" placeholder="像素, 原创">
          </label>
          <div class="field">
            <span class="field-label">目标格数上限
              <input
                v-model="gridDraft"
                class="field-number"
                type="number"
                :min="GRID_MIN"
                :max="GRID_MAX"
                step="1"
                inputmode="numeric"
                aria-label="目标格数上限手动输入"
                @change="commitGrid"
                @blur="commitGrid"
              >
            </span>
            <input v-model.number="gridWidth" type="range" :min="GRID_MIN" :max="GRID_MAX" step="1" aria-label="目标格数上限滑块">
          </div>
          <label class="field">
            <span class="field-label">颜色数上限 <b>{{ colorCap }}</b></span>
            <input v-model.number="colorCap" type="range" min="2" max="64" step="1">
          </label>
          <label class="field">
            <span class="field-label">分块涂色</span>
            <select v-model="partsMode">
              <option value="auto">自动（超过 64 宽分 3×3）</option>
              <option value="none" :disabled="actualWidth > 64">不分块</option>
              <option value="2">2×2</option>
              <option value="3">3×3</option>
            </select>
            <span v-if="actualWidth > 64" class="field-hint">大图必须分块，已锁定为自动或手动分块</span>
          </label>
        </div>
      </div>

      <p v-if="error" class="upload-error" role="alert">
        <PixelIcon name="warn" />
        <span>{{ error }}</span>
      </p>

      <footer class="upload-actions">
        <button type="button" @click="emit('close')">取消</button>
        <button type="button" class="primary" :disabled="!preview || saving" @click="save">
          <PixelIcon name="check" />
          <span>{{ saving ? '保存中…' : '保存作品' }}</span>
        </button>
      </footer>

      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="file-input"
        aria-label="选择图片文件"
        @change="onInputChange"
      >
    </div>
  </div>

  <div v-if="open && lightboxOpen" class="lightbox-backdrop" @click.self="lightboxOpen = false">
    <figure class="lightbox" role="dialog" aria-modal="true" aria-label="像素图大图">
      <button type="button" class="lightbox-close" aria-label="关闭大图" @click="lightboxOpen = false">
        <PixelIcon name="compress" />
      </button>
      <div class="lightbox-frame">
        <img class="lightbox-img" :src="thumbnail" :alt="`${title.trim() || '未命名作品'} 像素图大图`">
      </div>
      <figcaption class="lightbox-caption">
        <span class="lightbox-title">{{ title.trim() || '未命名作品' }}</span>
        <span class="lightbox-stats">{{ stats }}</span>
      </figcaption>
    </figure>
  </div>

  <ExportDialog :open="exportOpen" :artwork="preview" @close="exportOpen = false" />
</template>

<style scoped>
.upload-backdrop {
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

.upload-dialog {
  /* 尺寸旋钮：对话框最大宽度与左侧预览列宽，想调预览大小改这里 */
  --upload-width: 60rem;
  --upload-preview-col: 26rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: min(var(--upload-width), 100%);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  padding: var(--space-6);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.upload-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.upload-head h2 {
  font-size: var(--font-page-title);
}

.upload-close {
  display: inline-flex;
  padding: 0.4rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color var(--transition-fast), background-color var(--transition-fast);
}

.upload-close:hover {
  background: var(--color-surface-raised);
  color: var(--color-text);
}

.upload-close .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
}

.upload-pick {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-8);
  border: 2px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  transition: border-color var(--transition-fast), background-color var(--transition-fast);
}

.dropzone:hover,
.dropzone.dragover {
  border-color: var(--color-primary);
  background: rgb(255 204 102 / 8%);
}

.dropzone .pixel-icon {
  color: var(--icon-studio);
}

.dropzone-title {
  font-size: var(--font-card-title);
  font-weight: 600;
}

.dropzone-hint {
  color: var(--color-text-muted);
  font-size: var(--font-meta);
}

.upload-status {
  margin: 0;
  text-align: center;
  color: var(--color-text-muted);
}

.upload-body {
  display: grid;
  grid-template-columns: minmax(0, var(--upload-preview-col)) minmax(0, 1fr);
  gap: var(--space-6);
  align-items: start;
}

.upload-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.preview-frame {
  position: relative;
  display: grid;
  place-items: center;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-background);
}

.preview-canvas {
  width: 100%;
  height: auto;
  image-rendering: pixelated;
  /* 透明格露出棋盘格，和涂色画布的空格观感一致 */
  background-color: var(--color-surface);
  background-image:
    linear-gradient(45deg, var(--color-surface-raised) 25%, transparent 25%),
    linear-gradient(-45deg, var(--color-surface-raised) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--color-surface-raised) 75%),
    linear-gradient(-45deg, transparent 75%, var(--color-surface-raised) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}

.preview-expand {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.4rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgb(17 17 27 / 80%);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast),
    background-color var(--transition-fast);
}

.preview-expand:hover {
  border-color: var(--color-primary);
  background: var(--color-surface-raised);
  color: var(--color-primary);
}

.preview-expand .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
  color: inherit;
}

.preview-stats {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-meta);
  font-variant-numeric: tabular-nums;
}

.preview-note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-tag);
}

.change-image,
.download-image {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-meta);
  cursor: pointer;
  transition: border-color var(--transition-fast), background-color var(--transition-fast),
    color var(--transition-fast);
}

.change-image:hover {
  border-color: var(--color-border-strong);
  background: var(--color-surface-raised);
}

.change-image .pixel-icon,
.download-image .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
}

/* 下载是这次的主行动，用主色描边+淡底与「换一张」区分开 */
.download-image {
  border-color: var(--color-primary);
  background: rgb(255 204 102 / 12%);
  color: var(--color-primary);
  font-weight: 600;
}

.download-image .pixel-icon {
  color: inherit;
}

.download-image:hover:not(:disabled) {
  background: rgb(255 204 102 / 22%);
}

.download-image:disabled {
  border-color: var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  font-weight: 400;
  cursor: not-allowed;
  opacity: 0.6;
}

.upload-controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.field-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-meta);
}

.field-label b {
  color: var(--color-primary);
  font-size: var(--font-card-title);
  font-variant-numeric: tabular-nums;
}

.field input[type="text"],
.field select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font: inherit;
}

.field input[type="text"]:focus-visible,
.field select:focus-visible {
  border-color: var(--color-focus);
  outline: none;
}

.field input[type="range"] {
  width: 100%;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.field-number {
  width: 4.5rem;
  padding: 0.15rem 0.4rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  color: var(--color-primary);
  font-size: var(--font-card-title);
  font-variant-numeric: tabular-nums;
  text-align: right;
  appearance: textfield;
  -moz-appearance: textfield;
}

.field-number::-webkit-outer-spin-button,
.field-number::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.field-number:focus-visible {
  border-color: var(--color-focus);
  outline: none;
}

.field-hint {
  color: var(--color-text-muted);
  font-size: var(--font-tag);
}

.upload-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-sm);
  background: rgb(248 113 113 / 10%);
  color: var(--color-danger);
}

.upload-error .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
  color: inherit;
}

.upload-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-4);
}

.upload-actions button {
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

.upload-actions button:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  background: var(--color-surface-raised);
}

.upload-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.upload-actions .pixel-icon {
  width: var(--icon-size);
  height: var(--icon-size);
}

.upload-actions button.primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-background);
  font-weight: 600;
}

.upload-actions button.primary .pixel-icon {
  color: inherit;
}

.upload-actions button.primary:hover:not(:disabled) {
  background: var(--color-primary);
  filter: brightness(1.08);
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.lightbox-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgb(0 0 0 / 82%);
  overflow-y: auto;
}

.lightbox {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  margin: 0;
  max-width: 100%;
  animation: lightbox-in 160ms ease-out;
}

.lightbox-close {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.45rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.lightbox-close:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.lightbox-close .pixel-icon {
  width: var(--icon-size);
  height: var(--icon-size);
  color: inherit;
}

.lightbox-frame {
  display: grid;
  place-items: center;
  width: min(90vw, 56rem);
  height: min(78vh, 56rem);
  padding: var(--space-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: var(--color-background);
  background-image:
    linear-gradient(45deg, var(--color-surface) 25%, transparent 25%),
    linear-gradient(-45deg, var(--color-surface) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--color-surface) 75%),
    linear-gradient(-45deg, transparent 75%, var(--color-surface) 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
}

.lightbox-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.lightbox-caption {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  text-align: center;
}

.lightbox-title {
  font-size: var(--font-card-title);
  font-weight: 600;
}

.lightbox-stats {
  color: var(--color-text-muted);
  font-size: var(--font-meta);
  font-variant-numeric: tabular-nums;
}

@keyframes lightbox-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (max-width: 720px) {
  .upload-body {
    grid-template-columns: 1fr;
  }

  .upload-preview {
    align-items: center;
  }

  .change-image,
  .download-image {
    align-self: center;
  }
}
</style>