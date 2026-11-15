import { shallowRef } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

// 记录「从哪个页面点进自由涂色」，返回时按来源回原页面，而不是按作品类型：
// 发布到素材库的用户作品从素材库点开应回素材库，从制作页点开才回制作页。
// 由路由 beforeEach 在每次进入 paint 时写入；深链/刷新时来源是 START（无 name），涂色页走兜底。
const origin = shallowRef<RouteLocationNormalizedLoaded | null>(null)

export function recordPaintOrigin(from: RouteLocationNormalizedLoaded): void {
  origin.value = from
}

export function usePaintOrigin() {
  return origin
}