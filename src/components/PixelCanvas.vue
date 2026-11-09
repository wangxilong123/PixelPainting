<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createPixelCanvas, type PaintResult, type PaintStatus, type PixelCanvasController } from '../canvas/pixelCanvas'
import { createDefaultViewport } from '../canvas/viewport'
import type { Level, LevelViewport } from '../models/level'
import { getInteractiveCellCount, type PartRect } from '../services/levelService'

const props = defineProps<{
  level: Level
  readPainted: () => readonly number[]
  commitPaint: (index: number, colorId: number) => PaintStatus
  selectedColorId: number | null
  viewport?: LevelViewport
  hintIndex?: number | null
  part?: PartRect | null
  autoFit?: boolean
}>()

const emit = defineEmits<{
  paint: [result: PaintResult]
  progress: [progress: { paintedCount: number; total: number }]
  completed: []
  'viewport-change': [viewport: LevelViewport]
}>()

const element = ref<HTMLCanvasElement | null>(null)
const available = ref(true)
let controller: PixelCanvasController | undefined

function mountController(): void {
  const canvas = element.value
  if (!canvas) return

  controller?.destroy()
  const level = props.level
  const total = getInteractiveCellCount(level)
  controller = createPixelCanvas({
    canvas,
    level,
    readPainted: () => props.readPainted(),
    commitPaint: (index, colorId) => props.commitPaint(index, colorId),
    onPaint(result) {
      emit('paint', result)
      if (result.status !== 'painted') return

      const painted = props.readPainted()
      let paintedCount = 0
      for (const [index, color] of level.cells.entries()) {
        if (color !== 0 && painted[index] === color) paintedCount += 1
      }
      emit('progress', { paintedCount, total })
      if (paintedCount === total) emit('completed')
    },
    onViewportChange: (viewport) => emit('viewport-change', viewport),
    autoFit: props.autoFit,
  })
  available.value = controller.available
  controller.setSelectedColor(props.selectedColorId)
  controller.setHint(props.hintIndex ?? null)
  // 先按块复位视口，再套用存档里的视口：恢复同一块时玩家的缩放平移优先
  controller.setPart(props.part ?? null)
  controller.setViewport(props.viewport ?? createDefaultViewport())
}

onMounted(mountController)
onBeforeUnmount(() => controller?.destroy())
watch(() => props.level, mountController)
watch(() => props.selectedColorId, (color) => controller?.setSelectedColor(color))
watch(() => props.hintIndex, (index) => controller?.setHint(index ?? null))
watch(() => props.part, (part) => controller?.setPart(part ?? null))
watch(() => props.viewport, (viewport) => controller?.setViewport(viewport ?? createDefaultViewport()))
watch(() => props.readPainted(), () => controller?.invalidate())

defineExpose({
  zoomAt: (x: number, y: number, delta: number) => controller?.zoomAt(x, y, delta),
  panBy: (x: number, y: number) => controller?.panBy(x, y),
  resetViewport: () => controller?.resetViewport(),
  centerOnCell: (index: number) => controller?.centerOnCell(index),
})
</script>

<template>
  <canvas v-show="available" ref="element" class="pixel-canvas" :aria-label="level.title + '涂色画布'">
    当前浏览器不支持 Canvas。
  </canvas>
  <p v-if="!available" role="status">当前浏览器无法绘制像素画布。</p>
</template>

<style scoped>
/* 不加边框：指针按 getBoundingClientRect 映射到绘制表面，边框会让点击偏移两像素 */
.pixel-canvas {
  display: block;
  /* 吃掉游戏页的剩余高度，屏幕太矮时退回 min-height 让页面滚动。
     basis 必须是 0：canvas 有内在宽高比，auto 会让背板尺寸反过来撑高布局 */
  flex: 1 1 0;
  width: 100%;
  min-height: clamp(15rem, 58vh, 34rem);
  border: 0;
  padding: 0;
  background: var(--color-surface);
  touch-action: none;
}
</style>
