<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PixelArtwork } from '../models/artwork'
import {
  artworkToDataUrl,
  downloadArtwork,
  exportFileName,
  exportFormats,
  formatFileSize,
  getExportFormat,
  type ExportFormatId,
} from '../services/artworkExport'
import PixelIcon from './PixelIcon.vue'

const props = defineProps<{ open: boolean; artwork: PixelArtwork | null }>()
const emit = defineEmits<{ close: [] }>()

const DEFAULT_SCALE = 8
const SCALE_MIN = 1
const SCALE_MAX = 16

const format = ref<ExportFormatId>('png')
const scale = ref(DEFAULT_SCALE)
const bgMode = ref<'transparent' | 'white' | 'black' | 'custom'>('transparent')
const customColor = ref('#FFCC66')
const quality = ref(0.92)
const previewUrl = ref('')
const previewError = ref<string | null>(null)
const downloadError = ref<string | null>(null)
const notice = ref<string | null>(null)
const busy = ref(false)

const currentFormat = computed(() => getExportFormat(format.value))
const supportsAlpha = computed(() => currentFormat.value.alpha)
const lossy = computed(() => format.value !== 'png')
const outWidth = computed(() => (props.artwork?.width ?? 0) * scale.value)
const outHeight = computed(() => (props.artwork?.height ?? 0) * scale.value)
const fileName = computed(() => (props.artwork ? exportFileName(props.artwork.title, currentFormat.value.ext) : ''))

const effectiveBackground = computed<string | null>(() => {
  if (bgMode.value === 'transparent') return null
  if (bgMode.value === 'white') return '#FFFFFF'
  if (bgMode.value === 'black') return '#000000'
  return customColor.value
})

// base64 长度反推字节数，作为「约文件大小」的实时估算（下载后给精确值）
const approxBytes = computed(() => {
  const comma = previewUrl.value.indexOf(',')
  if (comma < 0) return 0
  const b64 = previewUrl.value.slice(comma + 1)
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding)
})

function refreshPreview(): void {
  if (!props.open || !props.artwork) {
    previewUrl.value = ''
    return
  }
  try {
    previewUrl.value = artworkToDataUrl(props.artwork, {
      format: format.value,
      scale: scale.value,
      background: effectiveBackground.value,
      quality: quality.value,
    })
    previewError.value = null
  } catch (e) {
    previewUrl.value = ''
    previewError.value = e instanceof Error ? e.message : '预览失败'
  }
}

function resetDefaults(): void {
  format.value = 'png'
  scale.value = DEFAULT_SCALE
  bgMode.value = 'transparent'
  customColor.value = '#FFCC66'
  quality.value = 0.92
  notice.value = null
  downloadError.value = null
}

watch([() => props.open, () => props.artwork, format, scale, bgMode, customColor, quality], () => {
  notice.value = null
  refreshPreview()
}, { immediate: true })

// 切到不支持透明的格式时，透明底自动改成白底，避免导出黑底
watch(format, (id) => {
  if (!getExportFormat(id).alpha && bgMode.value === 'transparent') bgMode.value = 'white'
})

watch(() => props.open, (open) => {
  if (open) {
    resetDefaults()
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
}, { immediate: true })

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

function chooseFormat(id: ExportFormatId): void {
  format.value = id
}

function chooseBackground(mode: 'transparent' | 'white' | 'black' | 'custom'): void {
  if (mode === 'transparent' && !supportsAlpha.value) return
  bgMode.value = mode
}

async function download(): Promise<void> {
  if (!props.artwork || busy.value) return
  busy.value = true
  downloadError.value = null
  try {
    const size = await downloadArtwork(props.artwork, {
      format: format.value,
      scale: scale.value,
      background: effectiveBackground.value,
      quality: quality.value,
    })
    notice.value = `已保存 ${fileName.value} · ${formatFileSize(size)}`
  } catch (e) {
    downloadError.value = e instanceof Error ? e.message : '下载失败，请重试'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="open && artwork" class="export-backdrop" @click.self="emit('close')">
    <div role="dialog" aria-modal="true" aria-label="下载像素图" class="export-dialog">
      <header class="export-head">
        <h2>
          <PixelIcon name="download" />
          <span>下载像素图</span>
        </h2>
        <button type="button" class="export-close" aria-label="关闭" @click="emit('close')">
          <PixelIcon name="close" />
        </button>
      </header>

      <p class="export-subtitle">《{{ artwork.title }}》 · {{ artwork.width }}×{{ artwork.height }} 格</p>

      <div class="export-body">
        <div class="export-preview">
          <div class="preview-frame" :class="{ opaque: effectiveBackground }">
            <img v-if="previewUrl" class="preview-img" :src="previewUrl" :alt="`${artwork.title} 导出预览`">
            <span v-else class="preview-placeholder">
              <PixelIcon name="warn" />
            </span>
          </div>
          <p class="preview-info" aria-live="polite">
            <span>{{ outWidth }}×{{ outHeight }} px</span>
            <span v-if="approxBytes > 0">约 {{ formatFileSize(approxBytes) }}</span>
          </p>
          <p class="preview-name">{{ fileName }}</p>
        </div>

        <div class="export-controls">
          <div class="control">
            <span class="control-label">格式</span>
            <div class="segmented" role="group" aria-label="导出格式">
              <button
                v-for="entry in exportFormats"
                :key="entry.id"
                type="button"
                class="segment"
                :class="{ active: format === entry.id }"
                :aria-pressed="format === entry.id"
                @click="chooseFormat(entry.id)"
              >
                {{ entry.label }}
              </button>
            </div>
            <span class="control-hint">{{ supportsAlpha ? '支持透明背景' : '不支持透明，自动铺底色' }}</span>
          </div>

          <div class="control">
            <span class="control-label">放大倍率 <b>{{ scale }}×</b></span>
            <input
              v-model.number="scale"
              type="range"
              :min="SCALE_MIN"
              :max="SCALE_MAX"
              step="1"
              aria-label="放大倍率"
            >
            <span class="control-hint">整数倍放大保持像素硬边，输出 {{ outWidth }}×{{ outHeight }} px</span>
          </div>

          <div class="control">
            <span class="control-label">背景</span>
            <div class="bg-chips" role="group" aria-label="导出背景">
              <button
                type="button"
                class="bg-chip"
                :class="{ active: bgMode === 'transparent' }"
                :disabled="!supportsAlpha"
                :aria-pressed="bgMode === 'transparent'"
                @click="chooseBackground('transparent')"
              >
                <span class="swatch swatch-transparent" />透明
              </button>
              <button
                type="button"
                class="bg-chip"
                :class="{ active: bgMode === 'white' }"
                :aria-pressed="bgMode === 'white'"
                @click="chooseBackground('white')"
              >
                <span class="swatch" style="background: #FFFFFF" />白
              </button>
              <button
                type="button"
                class="bg-chip"
                :class="{ active: bgMode === 'black' }"
                :aria-pressed="bgMode === 'black'"
                @click="chooseBackground('black')"
              >
                <span class="swatch" style="background: #000000" />黑
              </button>
              <button
                type="button"
                class="bg-chip"
                :class="{ active: bgMode === 'custom' }"
                :aria-pressed="bgMode === 'custom'"
                @click="chooseBackground('custom')"
              >
                <span class="swatch" :style="{ background: customColor }" />自定义
              </button>
              <input
                v-model="customColor"
                type="color"
                class="color-picker"
                aria-label="自定义背景颜色"
                @input="bgMode = 'custom'"
              >
            </div>
          </div>

          <div v-if="lossy" class="control">
            <span class="control-label">质量 <b>{{ Math.round(quality * 100) }}%</b></span>
            <input
              v-model.number="quality"
              type="range"
              min="0.5"
              max="1"
              step="0.05"
              aria-label="压缩质量"
            >
            <span class="control-hint">越高越清晰，文件越大</span>
          </div>
        </div>
      </div>

      <p v-if="previewError" class="export-error" role="alert">
        <PixelIcon name="warn" />
        <span>{{ previewError }}</span>
      </p>
      <p v-if="downloadError" class="export-error" role="alert">
        <PixelIcon name="warn" />
        <span>{{ downloadError }}</span>
      </p>
      <p v-if="notice" class="export-notice" role="status">
        <PixelIcon name="check" />
        <span>{{ notice }}</span>
      </p>

      <footer class="export-actions">
        <button type="button" class="ghost" @click="resetDefaults">
          <PixelIcon name="replay" />
          <span>重置</span>
        </button>
        <button type="button" class="primary" :disabled="busy || !previewUrl" @click="download">
          <PixelIcon name="download" />
          <span>{{ busy ? '导出中…' : '下载' }}</span>
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.export-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: var(--color-scrim);
  overflow-y: auto;
}

.export-dialog {
  /* 尺寸旋钮：对话框最大宽度与左侧预览列宽 */
  --export-width: 46rem;
  --export-preview-col: 18rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: min(var(--export-width), 100%);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  padding: var(--space-6);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.export-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.export-head h2 {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--font-page-title);
}

.export-head h2 .pixel-icon {
  width: var(--icon-size);
  height: var(--icon-size);
  color: var(--color-primary);
}

.export-close {
  display: inline-flex;
  padding: 0.4rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color var(--transition-fast), background-color var(--transition-fast);
}

.export-close:hover {
  background: var(--color-surface-raised);
  color: var(--color-text);
}

.export-close .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
  color: inherit;
}

.export-subtitle {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-meta);
}

.export-body {
  display: grid;
  grid-template-columns: minmax(0, var(--export-preview-col)) minmax(0, 1fr);
  gap: var(--space-6);
  align-items: start;
}

.export-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.preview-frame {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: var(--color-background);
  /* 透明底露出棋盘格，和涂色画布空格观感一致 */
  background-image:
    linear-gradient(45deg, var(--color-surface-raised) 25%, transparent 25%),
    linear-gradient(-45deg, var(--color-surface-raised) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--color-surface-raised) 75%),
    linear-gradient(-45deg, transparent 75%, var(--color-surface-raised) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  overflow: hidden;
}

.preview-frame.opaque {
  background-image: none;
}

.preview-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.preview-placeholder {
  display: grid;
  place-items: center;
  color: var(--color-danger);
}

.preview-placeholder .pixel-icon {
  width: 2rem;
  height: 2rem;
}

.preview-info {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-meta);
  font-variant-numeric: tabular-nums;
}

.preview-name {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-tag);
  word-break: break-all;
}

.export-controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.control {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.control-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-meta);
}

.control-label b {
  color: var(--color-primary);
  font-size: var(--font-card-title);
  font-variant-numeric: tabular-nums;
}

.control-hint {
  color: var(--color-text-muted);
  font-size: var(--font-tag);
}

.control input[type="range"] {
  width: 100%;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.segmented {
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.segment {
  padding: 0.45rem 1rem;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--font-meta);
  cursor: pointer;
  transition: color var(--transition-fast), background-color var(--transition-fast);
}

.segment + .segment {
  border-left: 1px solid var(--color-border);
}

.segment:hover {
  color: var(--color-text);
}

.segment.active {
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-weight: 600;
}

.bg-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.bg-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--font-tag);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.bg-chip:hover:not(:disabled) {
  color: var(--color-text);
  border-color: var(--color-border-strong);
}

.bg-chip.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.bg-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.swatch {
  width: 0.9rem;
  height: 0.9rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.2rem;
}

.swatch-transparent {
  background-image:
    linear-gradient(45deg, var(--color-text-muted) 25%, transparent 25%),
    linear-gradient(-45deg, var(--color-text-muted) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--color-text-muted) 75%),
    linear-gradient(-45deg, transparent 75%, var(--color-text-muted) 75%);
  background-size: 6px 6px;
  background-position: 0 0, 0 3px, 3px -3px, -3px 0;
}

.color-picker {
  width: 2.2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
}

.export-error,
.export-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0.6rem 0.9rem;
  border-radius: var(--radius-sm);
  font-size: var(--font-meta);
}

.export-error {
  border: 1px solid var(--color-danger);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.export-notice {
  border: 1px solid var(--color-success);
  background: var(--color-success-soft);
  color: var(--color-success);
}

.export-error .pixel-icon,
.export-notice .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
  color: inherit;
}

.export-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-4);
}

.export-actions button {
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
  transition: border-color var(--transition-fast), background-color var(--transition-fast), filter var(--transition-fast);
}

.export-actions button:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  background: var(--color-surface-raised);
}

.export-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.export-actions .pixel-icon {
  width: var(--icon-size);
  height: var(--icon-size);
  color: inherit;
}

.export-actions button.primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-weight: 600;
}

.export-actions button.primary:hover:not(:disabled) {
  background: var(--color-primary);
  filter: brightness(1.08);
}

@media (max-width: 720px) {
  .export-body {
    grid-template-columns: 1fr;
  }

  .export-preview {
    align-items: center;
  }

  .preview-frame {
    width: min(100%, 18rem);
  }
}
</style>