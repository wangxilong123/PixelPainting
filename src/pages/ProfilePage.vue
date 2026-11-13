<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import ArtworkCard from '../components/ArtworkCard.vue'
import Pager from '../components/Pager.vue'
import PixelIcon from '../components/PixelIcon.vue'
import SearchBar from '../components/SearchBar.vue'
import type { PixelArtwork } from '../models/artwork'
import type { LevelProgress, ProgressSource } from '../models/level'
import { artworkMatchesQuery, getAllArtworks } from '../services/artworkService'
import { listUserArtworks, storageNotice } from '../services/artworkStorage'
import { getLevels } from '../services/levelService'
import { getLevelSummary, isLevelUnlocked, loadProgress } from '../services/progressService'
import { getPortfolio, getPlayerStats, type PortfolioEntry } from '../services/statsService'

const levels = getLevels()
const works = ref<PixelArtwork[]>([])
const records = ref<Record<string, LevelProgress>>({})
const loading = ref(true)
const query = ref('')
const page = ref(1)
const pageSize = 12

const sourceLabels: Record<ProgressSource, string> = {
  level: '关卡',
  artwork: '素材',
  user: '我的作品',
}

const stats = computed(() => getPlayerStats(records.value, works.value))
const levelSummary = computed(() => getLevelSummary(records.value))
const portfolio = computed(() => getPortfolio(records.value, works.value))
const filtered = computed(
  () => portfolio.value.filter((entry) => artworkMatchesQuery(entry.artwork, query.value)),
)
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
  // 用户作品必须先注册再解析存档，否则它们的进度记录会被当成无法识别而丢掉
  await listUserArtworks()
  works.value = [...getLevels(), ...getAllArtworks()]
  records.value = loadProgress()
  loading.value = false
})

function formatCount(value: number): string {
  return value.toLocaleString('zh-CN')
}

function formatCompletedAt(iso?: string): string {
  if (iso === undefined) return '已完成'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '已完成'
  const pad = (value: number) => String(value).padStart(2, '0')
  return `完成于 ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function isReplayable(entry: PortfolioEntry): boolean {
  return entry.source !== 'level' || isLevelUnlocked(levels, records.value, entry.artwork.id)
}

// 已通关但前置关卡进度被重置时关卡页会拒进并弹回选关页，这里直接给选关页，不做死链
function entryRoute(entry: PortfolioEntry): RouteLocationRaw {
  if (entry.source !== 'level') return { name: 'paint', params: { artworkId: entry.artwork.id } }
  return isReplayable(entry)
    ? { name: 'game', params: { levelId: entry.artwork.id } }
    : { name: 'levels' }
}

function entryAction(entry: PortfolioEntry): string {
  if (entry.source !== 'level') return '查看作品'
  return isReplayable(entry) ? '重玩关卡' : '去选关页'
}
</script>

<template>
  <div class="profile-page">
    <div class="profile-head">
      <h2>个人中心</h2>
      <p class="profile-intro">你的涂色成绩和完成的作品，都保存在这台设备的浏览器里。</p>
    </div>

    <p v-if="storageNotice" class="profile-notice" role="alert">
      <PixelIcon name="warn" />
      <span>{{ storageNotice }}</span>
    </p>

    <p v-if="loading" class="profile-loading" aria-live="polite">正在加载成绩…</p>

    <template v-else>
      <div class="profile-stats">
        <article class="stat-card stat-works">
          <span class="stat-icon"><PixelIcon name="check" /></span>
          <span class="stat-body">
            <span class="stat-label">完成作品</span>
            <span class="stat-value">
              {{ formatCount(stats.completedWorks) }}<span class="stat-unit">幅</span>
            </span>
            <span class="stat-hint">关卡与自由涂色都计入</span>
          </span>
        </article>

        <article class="stat-card stat-pixels">
          <span class="stat-icon"><PixelIcon name="grid-on" /></span>
          <span class="stat-body">
            <span class="stat-label">已涂色像素</span>
            <span class="stat-value">
              {{ formatCount(stats.paintedPixels) }}<span class="stat-unit">格</span>
            </span>
            <span class="stat-hint">按已经涂上的格子累加</span>
          </span>
        </article>

        <article class="stat-card stat-levels">
          <span class="stat-icon"><PixelIcon name="levels" /></span>
          <span class="stat-body">
            <span class="stat-label">关卡进度</span>
            <span class="stat-value">
              {{ levelSummary.completed }}<span class="stat-slash">/</span>{{ stats.totalLevels }}<span class="stat-unit">关</span>
            </span>
            <span class="stat-hint">通关后解锁下一关</span>
          </span>
        </article>
      </div>

      <section class="profile-portfolio" aria-label="作品集">
        <div class="portfolio-head">
          <h3>作品集</h3>
          <span class="portfolio-count" aria-live="polite">共 {{ portfolio.length }} 幅已完成</span>
        </div>

        <template v-if="portfolio.length > 0">
          <SearchBar v-model="query" placeholder="搜索作品名称或标签" label="搜索作品集" />

          <div v-if="paged.length > 0" class="artwork-grid">
            <ArtworkCard
              v-for="entry in paged"
              :key="entry.artwork.id"
              :artwork="entry.artwork"
              :to="entryRoute(entry)"
              :badge="sourceLabels[entry.source]"
              :note="formatCompletedAt(entry.completedAt)"
              :action-label="entryAction(entry)"
            />
          </div>
          <div v-else class="profile-empty">
            <PixelIcon name="search" />
            <p>没有找到匹配的作品，换个关键词试试。</p>
          </div>

          <Pager :page="page" :total-pages="totalPages" @change="page = $event" />
        </template>

        <div v-else class="profile-empty profile-empty-first">
          <PixelIcon name="profile" :size="48" />
          <p>还没有完成的作品。涂满一幅像素图，它就会出现在这里。</p>
          <div class="profile-actions">
            <RouterLink class="profile-cta" :to="{ name: 'levels' }">
              <PixelIcon name="levels" />
              <span>去关卡模式</span>
            </RouterLink>
            <RouterLink class="profile-cta profile-cta-quiet" :to="{ name: 'materials' }">
              <PixelIcon name="materials" />
              <span>去素材库</span>
            </RouterLink>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.profile-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.profile-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.profile-head h2 {
  font-size: var(--font-page-title);
}

.profile-intro {
  margin: 0;
  color: var(--color-text-muted);
}

.profile-notice {
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

.profile-notice .pixel-icon {
  width: var(--icon-size-sm);
  height: var(--icon-size-sm);
  color: inherit;
}

.profile-loading {
  margin: 0;
  color: var(--color-text-muted);
}

.profile-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
}

.stat-card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.stat-works {
  --stat-accent: var(--icon-fresh);
}

.stat-pixels {
  --stat-accent: var(--icon-materials);
}

.stat-levels {
  --stat-accent: var(--icon-levels);
}

.stat-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--stat-icon-box);
  height: var(--stat-icon-box);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background);
  color: var(--stat-accent);
}

.stat-icon .pixel-icon {
  width: var(--icon-size);
  height: var(--icon-size);
  color: inherit;
}

.stat-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--space-1);
}

.stat-label {
  color: var(--color-text-muted);
  font-size: var(--font-meta);
}

.stat-value {
  font-size: var(--font-stat-value);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.stat-unit,
.stat-slash {
  margin-left: 0.25rem;
  color: var(--color-text-muted);
  font-size: var(--font-meta);
  font-weight: 400;
}

.stat-slash {
  margin: 0 0.15rem;
}

.stat-hint {
  color: var(--color-text-muted);
  font-size: var(--font-tag);
}

.profile-portfolio {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.portfolio-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.portfolio-head h3 {
  margin: 0;
  font-size: var(--font-section-title);
}

.portfolio-count {
  color: var(--color-text-muted);
  font-size: var(--font-meta);
  font-variant-numeric: tabular-nums;
}

.artwork-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}

.profile-empty {
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

.profile-empty .pixel-icon {
  width: 2rem;
  height: 2rem;
}

.profile-empty p {
  margin: 0;
}

.profile-empty-first .pixel-icon {
  width: 3rem;
  height: 3rem;
  color: var(--icon-profile);
}

.profile-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-4);
}

.profile-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1.1rem;
  border: 2px solid var(--color-primary);
  border-radius: var(--radius-lg);
  background: var(--color-primary);
  color: var(--color-background);
  font-size: var(--action-font);
  font-weight: 600;
  text-decoration: none;
  transition: filter var(--transition-fast);
}

.profile-cta:hover {
  filter: brightness(1.08);
}

.profile-cta-quiet {
  border-color: var(--color-border-strong);
  background: transparent;
  color: var(--color-text);
}

.profile-cta-quiet:hover {
  border-color: var(--color-primary);
  filter: none;
}

.profile-cta .pixel-icon {
  width: var(--icon-size);
  height: var(--icon-size);
  color: inherit;
}

@media (max-width: 1024px) {
  .artwork-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 900px) {
  .profile-stats {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .artwork-grid {
    grid-template-columns: 1fr;
  }

  .stat-card {
    padding: var(--space-4);
  }
}
</style>