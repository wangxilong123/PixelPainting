import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

export interface MasonryPosition {
  left: number
  top: number
  width: number
}

export interface MasonryLayout {
  positions: MasonryPosition[]
  height: number
}

/**
 * 最短列瀑布流：按顺序把每幅塞进当前最矮的列，前几幅自然横向铺满顶部（横着砌砖）。
 * 纯函数，便于脱离 DOM 断言排布结果。
 */
export function computeMasonryLayout(
  itemHeights: readonly number[],
  containerWidth: number,
  columns: number,
  gap: number,
): MasonryLayout {
  const colWidth = (containerWidth - gap * (columns - 1)) / columns
  const heights = new Array<number>(columns).fill(0)
  const positions = itemHeights.map((h) => {
    let col = 0
    for (let i = 1; i < columns; i++) {
      if (heights[i] < heights[col]) col = i
    }
    const position = { left: col * (colWidth + gap), top: heights[col], width: colWidth }
    heights[col] += h + gap
    return position
  })
  const height = itemHeights.length > 0 ? Math.max(...heights) - gap : 0
  return { positions, height }
}

// 与列表页响应式断点一致：>1024 四列、561–1024 两列、≤560 一列
function columnCount(): number {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 4
  if (window.matchMedia('(max-width: 560px)').matches) return 1
  if (window.matchMedia('(max-width: 1024px)').matches) return 2
  return 4
}

// 间距跟随设计令牌 --space-4（rem 按根字号折算成像素）
function readGap(el: HTMLElement): number {
  const raw = getComputedStyle(el).getPropertyValue('--space-4').trim()
  const value = parseFloat(raw)
  if (Number.isNaN(value)) return 16
  if (raw.endsWith('rem')) {
    const rootFs = parseFloat(getComputedStyle(document.documentElement).fontSize)
    return value * (Number.isNaN(rootFs) ? 16 : rootFs)
  }
  return value
}

/**
 * 把容器里的子元素排成瀑布流：子元素绝对定位、容器高度取最高列。
 * 触发时机：挂载、条目变化、窗口缩放、子元素尺寸变化（缩略图加载后卡片长高）。
 */
export function useMasonry(container: Ref<HTMLElement | null>, getItems: () => readonly unknown[]): void {
  let observer: ResizeObserver | undefined
  let frame = 0
  let disposed = false

  function layout(): void {
    const el = container.value
    if (!el) return
    const children = Array.from(el.children) as HTMLElement[]
    if (children.length === 0) {
      el.style.height = ''
      return
    }
    const columns = columnCount()
    const gap = readGap(el)
    const colWidth = (el.clientWidth - gap * (columns - 1)) / columns
    if (colWidth <= 0) return
    // 先统一设宽，再读高，避免逐元素读写交替造成多次回流
    for (const item of children) {
      item.style.position = 'absolute'
      item.style.width = `${colWidth}px`
    }
    const heights = children.map((item) => item.offsetHeight)
    const { positions, height } = computeMasonryLayout(heights, el.clientWidth, columns, gap)
    children.forEach((item, i) => {
      item.style.left = `${positions[i].left}px`
      item.style.top = `${positions[i].top}px`
    })
    el.style.height = `${height}px`
  }

  function schedule(): void {
    if (disposed) return
    if (typeof requestAnimationFrame !== 'function') {
      layout()
      return
    }
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => layout())
  }

  function observeItems(): void {
    if (!observer) return
    observer.disconnect()
    const el = container.value
    if (!el) return
    for (const child of el.children) observer.observe(child)
  }

  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => schedule())
    }
    window.addEventListener('resize', schedule)
    observeItems()
    void nextTick(() => schedule())
  })

  watch(getItems, () => {
    void nextTick(() => {
      observeItems()
      schedule()
    })
  })

  onBeforeUnmount(() => {
    disposed = true
    observer?.disconnect()
    window.removeEventListener('resize', schedule)
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
  })
}