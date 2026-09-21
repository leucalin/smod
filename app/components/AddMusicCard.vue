<script setup lang="ts">
import type { MusicItem, Source } from '~/composables/useMusicStore'
import { SOURCE_META } from '~/composables/useMusicStore'

const {
  searchBilibili,
  searchNetease,
  addMusic,
  isAddedByBvid,
  isAddedByNeteaseId,
} = useMusicStore()
const { showToast } = useToast()

/** 已接入的音源（QQ 音乐 / 本地暂未接入，不展示） */
const sources: Source[] = ['bilibili', 'netease']
const source = ref<Source>('bilibili')
const keyword = ref('')
const searching = ref(false)
const results = ref<MusicItem[]>([])
const searched = ref(false)
const searchError = ref('')
/** 最近添加成功的歌曲（结果区展示成功提示） */
const addedItem = ref<MusicItem | null>(null)
const page = ref(1)
const targetPage = ref(1)
const total = ref(0)
const numPages = ref(1)

const SOURCE_DOT: Record<Source, string> = {
  bilibili: '#fb7299',
  netease: '#c20c0c',
  qqmusic: '#31c27c',
  local: '#8e8e93',
}

/** 首次搜索显示骨架；翻页时保留旧网格并叠加加载遮罩（高度稳定） */
const firstLoad = computed(() => !results.value.length)

const runSearch = async () => {
  if (!keyword.value.trim()) {
    showToast('请输入搜索关键词')
    return
  }
  await fetchPage(1, { resetError: true })
}

/** 按来源判断搜索结果是否已添加 */
const isItemAdded = (item: MusicItem) =>
  item.source === 'netease'
    ? isAddedByNeteaseId(item.neteaseId)
    : isAddedByBvid(item.bvid)

const fetchPage = async (target: number, opts: { resetError?: boolean } = {}) => {
  if (searching.value) return
  searching.value = true
  targetPage.value = target
  addedItem.value = null
  if (opts.resetError) searchError.value = ''
  try {
    const res =
      source.value === 'netease'
        ? await searchNetease(keyword.value, target)
        : await searchBilibili(keyword.value, target)
    results.value = res.items
    total.value = res.total
    numPages.value = Math.max(1, Math.min(res.numPages, 50))
    page.value = target
    searched.value = true
  } catch (err) {
    const msg = err instanceof Error ? err.message : '搜索失败，请稍后再试'
    if (opts.resetError) {
      // 首次搜索失败：清空结果并展示错误区
      results.value = []
      searched.value = true
      searchError.value = msg
    }
    showToast(msg)
  } finally {
    searching.value = false
  }
}

const goPage = (target: number) => {
  const t = Math.max(1, Math.min(target, numPages.value))
  if (t === page.value || searching.value) return
  fetchPage(t)
}

const onAdd = async (item: MusicItem) => {
  try {
    await addMusic(item)
    // 添加成功：清空搜索结果，结果区展示成功提示（Toast 一并保留）
    addedItem.value = item
    results.value = []
    searchError.value = ''
    page.value = 1
    total.value = 0
    numPages.value = 1
    showToast(`已添加「${item.title}」`, { kind: 'success' })
  } catch (err) {
    showToast(err instanceof Error ? err.message : '添加失败，请稍后再试')
  }
}

/** 回到可搜索状态（清空成功提示，保留关键词方便继续添加） */
const continueSearch = () => {
  addedItem.value = null
  searched.value = false
}
</script>

<template>
  <section class="card add-card">
    <div class="head">
      <div class="head-left">
        <h2 class="title">添加音乐</h2>
        <p class="desc">搜索并添加音乐课用曲，支持 bilibili MV 与网易云音乐两种音源</p>
      </div>
      <div class="segmented" role="tablist" aria-label="音乐来源">
        <button
          v-for="s in sources"
          :key="s"
          type="button"
          :class="{ active: source === s }"
          @click="source = s"
        >
          <span class="dot" :style="{ background: SOURCE_DOT[s] }" />
          {{ SOURCE_META[s].label }}
        </button>
      </div>
    </div>

    <form class="search-row" @submit.prevent="runSearch">
      <div class="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
          <path d="m20 20-3.2-3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        <input
          v-model="keyword"
          class="text-input"
          type="search"
          placeholder="搜索歌曲、歌手或 MV 标题…"
          aria-label="搜索关键词"
        />
      </div>
      <button class="btn btn-primary" type="submit" :disabled="searching">
        <span v-if="searching" class="spinner" />
        搜索
      </button>
    </form>

    <!-- 搜索结果 -->
    <div v-if="searching && firstLoad" class="results">
      <div v-for="i in 8" :key="i" class="result-card">
        <div class="cover shimmer" />
        <div class="lines">
          <div class="shimmer line w-9" />
          <div class="shimmer line w-6" />
        </div>
      </div>
    </div>

    <template v-else>
      <!-- 添加成功提示（替代被清空的搜索结果） -->
      <Transition v-if="addedItem" name="success-pop">
        <div class="add-success" role="status">
          <span class="success-badge" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="m4.5 12.5 5 5 10-11"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <div class="success-body">
            <p class="success-title" :title="addedItem.title">
              已成功添加「{{ addedItem.title }}」
            </p>
            <p class="success-desc">已保存到音乐列表，可在下方「已添加音乐」中查看</p>
          </div>
          <button
            class="btn btn-secondary btn-sm success-again"
            type="button"
            @click="continueSearch"
          >
            继续搜索
          </button>
        </div>
      </Transition>

      <div v-else-if="searched && !searchError && results.length" class="results">
      <div
        v-for="item in results"
        :key="item.id"
        class="result-card"
        :class="{ row: item.source === 'netease' }"
      >
        <div class="cover-wrap">
          <MediaCover
            :src="item.cover"
            :alt="item.title"
            :seed="item.title"
            :square="item.source === 'netease'"
          />
          <span class="duration">{{ item.duration || '--:--' }}</span>
          <span v-if="item.up" class="up">{{ item.up }}</span>
        </div>
        <div class="info">
          <p class="title" :title="item.title">{{ item.title }}</p>
          <p class="artist">
            {{ item.artist || '未知歌手' }}<span v-if="item.album"> · {{ item.album }}</span>
          </p>
          <button
            class="btn btn-primary btn-sm add-btn"
            :disabled="isItemAdded(item)"
            @click="onAdd(item)"
          >
            <svg v-if="!isItemAdded(item)" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
            </svg>
            {{ isItemAdded(item) ? '已添加' : '添加到音乐列表' }}
          </button>
        </div>
      </div>

      <!-- 翻页加载遮罩：保留旧网格，高度稳定 -->
      <Transition name="fade">
        <div v-if="searching" class="paging-overlay">
          <span class="spinner" aria-hidden="true" />
          <span class="paging-text">正在加载第 {{ targetPage }} 页…</span>
        </div>
      </Transition>
    </div>

    <div v-else-if="searched && searchError" class="no-result error">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
        <path d="M12 7.5v5.5M12 16.5v.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <p>{{ searchError }}</p>
    </div>

    <div v-else-if="searched" class="no-result">
      <p>没有找到相关 MV，换个关键词试试</p>
    </div>

    <!-- 分页器 -->
    <div v-if="searched && !searchError && results.length && numPages > 1" class="pager">
      <button
        class="btn btn-secondary btn-sm"
        type="button"
        :disabled="page <= 1 || searching"
        @click="goPage(page - 1)"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        上一页
      </button>
      <span class="pager-info">第 {{ page }} / {{ numPages }} 页 · 共 {{ total }} 条</span>
      <button
        class="btn btn-secondary btn-sm"
        type="button"
        :disabled="page >= numPages || searching"
        @click="goPage(page + 1)"
      >
        下一页
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <p v-else class="hint">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
        <path d="M12 11v5M12 8v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      选择音源并输入关键词：bilibili 展示视频封面、UP 主与时长，网易云展示专辑封面、歌手与时长
    </p>
    </template>
  </section>
</template>

<style scoped>
.add-card {
  padding: 24px;
  transition: box-shadow 0.25s ease-out;
}

.add-card:hover {
  box-shadow: var(--shadow-2);
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}

.title {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.014em;
}

.desc {
  margin-top: 5px;
  color: var(--text-tertiary);
  font-size: 13px;
}

.search-row {
  display: flex;
  gap: 12px;
  margin-top: 18px;
}

.hint {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-tertiary);
  font-size: 13px;
}

.results {
  margin-top: 18px;
  /* 不规则流式：横版/竖版卡片按自然高度排列 */
  columns: 228px;
  column-gap: 14px;
}

.result-card {
  border: 1px solid var(--separator);
  border-radius: 14px;
  overflow: hidden;
  background: var(--card);
  break-inside: avoid;
  margin-bottom: 14px;
  transition: transform 0.3s var(--spring-pop), box-shadow 0.2s ease-out;
}

.result-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-2);
}

/* 网易云等歌曲横向卡片：左侧正方形封面（显式尺寸） */
.result-card.row {
  display: flex;
  align-items: center;
}

.result-card.row .cover-wrap {
  flex: none;
  width: 108px;
  height: 108px;
  margin-left: 14px;
  border-radius: 10px;
  overflow: hidden;
}

/* 封面撑满显式容器（避免 16:9 高度导致放大裁切） */
.result-card.row .cover-wrap :deep(.media-cover) {
  height: 100%;
  aspect-ratio: auto;
}

.result-card.row .info {
  flex: 1;
  padding: 12px 14px;
}

.cover-wrap {
  position: relative;
}

.cover-wrap .duration {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.cover-wrap .up {
  position: absolute;
  left: 8px;
  top: 8px;
  max-width: 70%;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 11px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info {
  padding: 12px 14px 14px;
}

.title {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.8em;
}

.artist {
  margin-top: 5px;
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.add-btn {
  margin-top: 10px;
  width: 100%;
}

.no-result {
  margin-top: 18px;
  padding: 34px 20px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
  border: 1.5px dashed var(--separator);
  border-radius: 14px;
}

.no-result.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}

/* 添加成功提示 */
.add-success {
  margin-top: 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-radius: 14px;
  background: color-mix(in srgb, #34c759 9%, var(--card));
  border: 1px solid color-mix(in srgb, #34c759 32%, transparent);
}

.success-badge {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #34c759;
  color: #fff;
  box-shadow: 0 4px 14px rgba(52, 199, 89, 0.38);
}

.success-body {
  flex: 1;
  min-width: 0;
}

.success-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.005em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.success-desc {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.success-again {
  flex: none;
}

.success-pop-enter-active {
  transition: opacity 0.28s var(--spring-pop), transform 0.34s var(--spring-pop);
}
.success-pop-leave-active {
  transition: opacity 0.16s ease-in, transform 0.18s ease-in;
}
.success-pop-enter-from,
.success-pop-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}

@media (max-width: 640px) {
  .add-success {
    flex-wrap: wrap;
  }
  .success-again {
    width: 100%;
  }
}

/* 翻页加载遮罩 */
.results {
  position: relative;
}

.paging-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--card) 74%, transparent);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}

.paging-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.22s ease-out;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 分页器 */
.pager {
  margin-top: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.pager-info {
  color: var(--text-tertiary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  min-width: max-content;
}

@media (max-width: 640px) {
  .pager {
    flex-wrap: wrap;
    gap: 10px;
  }
}

.lines {
  padding: 12px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.line {
  height: 12px;
}

.w-9 {
  width: 92%;
}
.w-6 {
  width: 60%;
}

@media (max-width: 640px) {
  .search-row {
    flex-direction: column;
  }
}
</style>
