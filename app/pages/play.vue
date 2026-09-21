<script setup lang="ts">
import type { CourseSongItem } from '~/composables/useMusicStore'
import { SOURCE_META } from '~/composables/useMusicStore'

const route = useRoute()
const { loadCourseMusics } = useMusicStore()
const { showToast } = useToast()

/** 临近结束提示阈值（秒） */
const NEAR_END_SECONDS = 10

const courseId = String(route.query.course ?? '')

const items = ref<CourseSongItem[]>([])
const loading = ref(true)
const loadError = ref('')

const currentIndex = ref(0)
/** 当前媒体直链（bilibili 走流代理；网易云为音频直链） */
const srcUrl = ref('')
const fetchingStream = ref(false)
const paused = ref(true)
const endedWarned = ref(false)
const autoPlayNext = ref(true)

const videoEl = ref<HTMLVideoElement | null>(null)
const audioEl = ref<HTMLAudioElement | null>(null)

/** 视图切换过渡方向（下一首向右、上一首向左） */
const viewTransition = ref('view-forward')

/* ---------- VIP 尊享提示（顶部横幅） ---------- */

/** 已提示过的曲目（同一首只提示一次） */
const vipNotifiedIds = new Set<string>()
const vipBannerVisible = ref(false)
let vipBannerTimer: ReturnType<typeof setTimeout> | null = null

const showVipBanner = () => {
  vipBannerVisible.value = true
  if (vipBannerTimer) clearTimeout(vipBannerTimer)
  vipBannerTimer = setTimeout(() => {
    vipBannerVisible.value = false
  }, 4600)
}

const current = computed(() => items.value[currentIndex.value] ?? null)
const currentTitle = computed(() => current.value?.music.title ?? '')
const hasNext = computed(() => currentIndex.value < items.value.length - 1)
const hasPrev = computed(() => currentIndex.value > 0)

/** bilibili 视频 / 网易云音频 / 无源占位 */
const srcKind = computed<'video' | 'audio' | 'none'>(() => {
  const m = current.value?.music
  if (!m) return 'none'
  if (m.bvid) return 'video'
  if (m.neteaseId != null) return 'audio'
  return 'none'
})

const mediaEl = computed(() =>
  srcKind.value === 'audio' ? audioEl.value : videoEl.value,
)
const isAudio = computed(() => srcKind.value === 'audio')

/* ---------- 特定曲目保护 ----------
 * 播放周杰伦相关曲目（标题/专辑/歌名命中关键词，或网易云歌手为周杰伦）时，
 * 禁止通过「上一首 / 下一首」按钮切歌；播放结束后仍会自动连播下一首。
 */

const PROTECTED_ARTIST_KEYWORDS = ['周杰伦', 'jay chou', 'jaychou', '杰伦']

/** 周杰伦专辑与代表作品关键词（可按需补充） */
const PROTECTED_WORK_KEYWORDS = [
  // 专辑
  '范特西', '叶惠美', '七里香', '十一月的萧邦', '依然范特西', '我很忙',
  '魔杰座', '跨时代', '惊叹号', '十二新作', '哎呦，不错哦', '床边故事',
  '最伟大的作品', '寻找周杰伦',
  // 代表作品
  '晴天', '稻香', '青花瓷', '夜曲', '简单爱', '双截棍', '龙卷风', '星晴',
  '可爱女人', '开不了口', '半岛铁盒', '东风破', '以父之名', '三年二班',
  '断了的弦', '轨迹', '搁浅', '枫', '黑色毛衣', '发如雪', '珊瑚海',
  '一路向北', '白色风车', '听妈妈的话', '千里之外', '菊花台', '退后',
  '本草纲目', '夜的第七章', '牛仔很忙', '彩虹', '阳光宅男', '我不配',
  '最长的电影', '蒲公英的约定', '甜甜的', '不能说的秘密',
  '给我一首歌的时间', '说好的幸福呢', '兰亭序', '花海', '超人不会飞',
  '烟花易冷', '雨下一整晚', '爱的飞行日记', '明明就', '大笨钟',
  '红尘客栈', '手写的从前', '算什么男人', '天涯过客', '听见下雨的声音',
  '告白气球', '说走就走', '前世情人', '爱情废柴', '不该', '土耳其冰淇淋',
  '等你下课', '不爱我就拉倒', '说好不哭', '我是如此相信', 'mojito',
  '粉色海洋', '错过的烟火', '还在流浪', '倒影', '红颜如霜',
]

/** 当前曲目是否受保护（不可手动切歌） */
const isProtectedTrack = (item: CourseSongItem | null | undefined) => {
  if (!item) return false
  const m = item.music
  const haystack = `${m.title} ${m.album ?? ''}`.toLowerCase()
  const artist = (m.artist ?? '').toLowerCase()
  if (PROTECTED_ARTIST_KEYWORDS.some((k) => artist.includes(k))) return true
  if (PROTECTED_ARTIST_KEYWORDS.some((k) => haystack.includes(k))) return true
  return PROTECTED_WORK_KEYWORDS.some((k) => haystack.includes(k.toLowerCase()))
}

const switchBlocked = computed(() => isProtectedTrack(current.value))

/** 切歌入口：受保护曲目点击切换按钮时仅提示，不切换 */
const requestSwitch = (target: number) => {
  if (switchBlocked.value) {
    showToast('当前歌曲暂时无法切换', { kind: 'info' })
    return
  }
  playAt(target)
}

useHead({
  title: () =>
    currentTitle.value ? `正在播放：${currentTitle.value}` : '播放页面',
})

/* ---------- 歌词 ---------- */

interface LyricLine {
  time: number
  text: string
}

const lyricLines = ref<LyricLine[]>([])
const lyricIndex = ref(-1)
const lyricEls = ref<HTMLElement[]>([])

/** 播放进度（Apple Music 风格只读展示 + 点击跳转） */
const curTime = ref(0)
const durTime = ref(0)
const progressPct = computed(() =>
  durTime.value > 0 ? Math.min(100, (curTime.value / durTime.value) * 100) : 0,
)

const fmtTime = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const r = String(Math.floor(s % 60)).padStart(2, '0')
  return `${m}:${r}`
}

const findLyricIndex = (t: number) => {
  let idx = -1
  for (let i = 0; i < lyricLines.value.length; i++) {
    if (lyricLines.value[i].time <= t) idx = i
    else break
  }
  return idx
}

watch(lyricIndex, (i) => {
  if (i < 0) return
  const el = lyricEls.value?.[i]
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
})

/* ---------- 课程歌曲列表加载 ---------- */

onMounted(async () => {
  if (!courseId) {
    loadError.value = '未指定课程，请从课程列表点击「课程开始」进入'
    loading.value = false
    return
  }
  let all: CourseSongItem[]
  try {
    all = await loadCourseMusics(courseId)
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '加载课程歌曲失败'
    loading.value = false
    return
  }
  loading.value = false

  // 播放列表 = 尚未播放的曲目（已播历史不重复播放，也不重复上报）
  const pending = all.filter((it) => !it.played)
  if (!all.length) {
    loadError.value = '该课程暂无歌曲，请先在课程列表重新配置'
    return
  }
  if (!pending.length) {
    loadError.value = '课程歌曲均已播放完毕，可重新配置后开始新一轮课程'
    return
  }
  items.value = pending
  await playAt(0)
})

/* ---------- 播放控制 ---------- */

/** 本会话已上报播放完成的曲目（防止重复计数） */
const reportedIds = new Set<string>()
/** 连续播放失败跳过计数（防止全损死循环） */
const skipStreak = ref(0)

/** 标记曲目为已播放（切换/播放完成都会触发；重复标记自动忽略） */
const markPlayed = async (item?: CourseSongItem) => {
  if (!item || reportedIds.has(item.id)) return
  reportedIds.add(item.id)
  try {
    const res = await $fetch<{ code: number }>(`/api/courses/${courseId}/played`, {
      method: 'POST',
      body: { musicId: item.music.id },
    })
    if (res.code === 0) item.played = true
  } catch {
    // 网络异常本会话也视为已标记，避免重复上报
  }
}

/**
 * 切换到第 index 首并加载/播放心曲目
 * @param markPrev 切换前是否将当前曲目标记为已播放（失败跳过时应为 false）
 */
const playAt = async (
  index: number,
  opts: { autoplay?: boolean; markPrev?: boolean } = {},
) => {
  const { autoplay = true, markPrev = true } = opts
  if (markPrev) await markPlayed(current.value)
  // 方向感知过渡：切下一首向右滑入，上一首向左
  viewTransition.value =
    index >= currentIndex.value || currentIndex.value === 0
      ? 'view-forward'
      : 'view-back'
  endedWarned.value = false
  paused.value = true
  srcUrl.value = ''
  currentIndex.value = index
  lyricLines.value = []
  lyricIndex.value = -1
  curTime.value = 0
  durTime.value = 0
  autoPlayNext.value = autoplay
  const ok = await loadStream()
  if (ok) {
    skipStreak.value = 0
    return
  }
  // 无法播放：自动跳过下一首，但不标记为已播放
  skipStreak.value += 1
  const title = items.value[index]?.music.title ?? ''
  if (skipStreak.value >= items.value.length || !hasNext.value) {
    loadError.value = '剩余歌曲均无法播放，请检查网络后在课程列表重新配置'
    return
  }
  showToast(`「${title}」无法播放，已跳过`, { kind: 'error' })
  await playAt(index + 1, { markPrev: false })
}

/** 拉取当前歌曲媒体源与歌词；返回是否成功 */
const loadStream = async (): Promise<boolean> => {
  const item = current.value
  if (!item) return false
  const music = item.music

  if (music.bvid) {
    // bilibili MV：经流代理播放视频
    fetchingStream.value = true
    try {
      const res = await $fetch<{ code: number; message?: string; data?: { url: string } }>(
        '/api/bilibili/playurl',
        { query: { bvid: music.bvid } },
      )
      if (res.code !== 0 || !res.data?.url) {
        throw new Error(res.message || '获取视频播放地址失败')
      }
      srcUrl.value = `/api/bilibili/stream?bvid=${encodeURIComponent(music.bvid)}`
    } catch (err) {
      showToast(err instanceof Error ? err.message : '获取视频播放地址失败', {
        kind: 'error',
      })
      return false
    } finally {
      fetchingStream.value = false
    }
    return true
  }

  if (music.neteaseId != null) {
    // 网易云音乐：音频直链（登录时默认无损）+ 歌词
    fetchingStream.value = true
    try {
      const songRes = await $fetch<{
        code: number
        message?: string
        data?: { url: string; vip?: boolean; level?: string }
      }>('/api/netease/song', { query: { id: music.neteaseId } })
      if (songRes.code !== 0 || !songRes.data?.url) {
        throw new Error(songRes.message || '获取播放地址失败')
      }
      srcUrl.value = songRes.data.url
      // 以无损音质播放（动用了会员权益）时，弹出顶部 VIP 尊享提示
      if (songRes.data.vip && !vipNotifiedIds.has(music.id)) {
        vipNotifiedIds.add(music.id)
        showVipBanner()
      }
      try {
        const lyricRes = await $fetch<{ code: number; data?: { lines: LyricLine[] } }>(
          '/api/netease/lyric',
          { query: { id: music.neteaseId } },
        )
        lyricLines.value = lyricRes.code === 0 ? lyricRes.data?.lines ?? [] : []
      } catch {
        lyricLines.value = []
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '获取播放地址失败', {
        kind: 'error',
      })
      return false
    } finally {
      fetchingStream.value = false
    }
    return true
  }

  showToast(`「${music.title}」暂无可播放的音源`, { kind: 'error' })
  return false
}

watch(
  srcUrl,
  async () => {
    await nextTick()
    await ensurePlaying()
  },
  { flush: 'post' },
)

/** 自动播放（带重试）：跨视图过渡期新元素会延迟挂载，重试直至成功 */
let playRetryTimer: ReturnType<typeof setTimeout> | null = null
let playRetryCount = 0

const ensurePlaying = async () => {
  const m = mediaEl.value
  if (!srcUrl.value) return
  if (playRetryTimer) {
    clearTimeout(playRetryTimer)
    playRetryTimer = null
  }
  // 元素尚未挂载（视图过渡期）：安排重试
  if (!m) {
    if (playRetryCount++ < 20) {
      playRetryTimer = setTimeout(() => ensurePlaying(), 200)
    }
    return
  }
  if (!autoPlayNext.value) {
    paused.value = true
    return
  }
  try {
    await m.play()
    paused.value = false
    playRetryCount = 0
  } catch {
    // 元素未就绪 / 自动播放被拦截：稍后重试（最多约 3 秒）
    paused.value = true
    if (playRetryCount++ < 15) {
      playRetryTimer = setTimeout(() => ensurePlaying(), 200)
    }
  }
}

/** 媒体就绪兜底：跨视图切换时元素重新挂载后确保播放 */
const onMediaReady = () => {
  const m = mediaEl.value
  if (!m || !srcUrl.value) return
  if (isAudio.value) durTime.value = m.duration
  if (autoPlayNext.value && m.paused) {
    ensurePlaying()
  }
}

/** 周期性与媒体真实状态同步（防任何事件时序导致图标错乱） */
const stateTimer = import.meta.client
  ? setInterval(() => {
      const m = mediaEl.value
      if (!m || !srcUrl.value) return
      if (m.paused !== paused.value) {
        paused.value = m.paused
      }
    }, 400)
  : null

onBeforeUnmount(() => {
  if (stateTimer) clearInterval(stateTimer)
  if (playRetryTimer) clearTimeout(playRetryTimer)
  if (vipBannerTimer) clearTimeout(vipBannerTimer)
})

const togglePlay = () => {
  const m = mediaEl.value
  if (!m || !srcUrl.value) return
  if (m.paused) {
    m.play()
      .then(() => {
        paused.value = false
      })
      .catch(() => {})
  } else {
    m.pause()
    paused.value = true
  }
}

const onEnded = async () => {
  // 播放完成：playAt 离开时会自动标记为已播放并上报
  if (hasNext.value) {
    playAt(currentIndex.value + 1)
  } else {
    // 最后一首播放完毕：回到第一首（就绪不播放）
    showToast('本次课程播放完毕', { kind: 'success' })
    playAt(0, { autoplay: false })
  }
}

/** 播放进度：临近结束提示 + 歌词同步 + 进度更新 */
const onTimeUpdate = () => {
  const m = mediaEl.value
  if (!m || !m.duration || m.duration <= 0) return

  if (isAudio.value) {
    lyricIndex.value = findLyricIndex(m.currentTime)
    curTime.value = m.currentTime
    durTime.value = m.duration
  }

  const remain = m.duration - m.currentTime
  if (remain > 0 && remain <= NEAR_END_SECONDS && !endedWarned.value) {
    endedWarned.value = true
    if (!current.value) return
    const next = items.value[currentIndex.value + 1]
    showToast(
      next
        ? `「${current.value.music.title}」即将播放完毕，接下来播放「${next.music.title}」`
        : `「${current.value.music.title}」即将播放完毕`,
      { kind: 'info', duration: 3000 },
    )
  }
}

/** 媒体加载失败 */
const onMediaError = () => {
  if (!current.value) return
  showToast(`「${current.value.music.title}」加载失败，可尝试切换歌曲`, {
    kind: 'error',
  })
  srcUrl.value = ''
}
</script>

<template>
  <div class="page page-play">
    <!-- VIP 尊享提示（播放会员歌曲、以无损音质播放时自顶部浮现） -->
    <Transition name="vip-banner">
      <div v-if="vipBannerVisible" class="vip-banner" role="status">
        <span class="vip-icon" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 18.5V6.2c0-.4.27-.75.66-.85l8-2.1c.55-.15 1.09.27 1.09.84v12.6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
            <circle cx="6.6" cy="18.5" r="2.6" fill="currentColor" />
            <circle cx="16.3" cy="16.7" r="2.6" fill="currentColor" />
          </svg>
        </span>
        <span class="vip-text">网易云音乐助力潇湘学子，已为您播放VIP尊享歌曲</span>
      </div>
    </Transition>

    <!-- 舞台：视频 / 音乐（封面+歌词） -->
    <div class="stage" @click.self="togglePlay">
      <!-- 加载中 -->
      <div v-if="loading || (fetchingStream && !srcUrl && !loadError)" class="stage-overlay">
        <span class="spinner big" aria-hidden="true" />
        <p class="stage-hint">{{ loading ? '正在加载课程歌曲…' : '正在加载音源…' }}</p>
      </div>

      <!-- 错误 / 空态 -->
      <div v-else-if="loadError" class="stage-overlay">
        <p class="stage-hint">{{ loadError }}</p>
      </div>

      <!-- 无可用音源占位 -->
      <div v-else-if="!srcUrl && current" class="stage-overlay">
        <MediaCover
          class="stage-cover"
          :src="current.music.cover"
          :alt="current.music.title"
          :seed="current.music.title"
        />
        <p class="stage-hint">「{{ current.music.title }}」暂无可播放的音源</p>
      </div>

      <!-- ============ 视图过渡：MV 视频 ↔ 歌曲（封面+歌词） ============ -->
      <Transition :name="viewTransition" mode="out-in">
        <!-- bilibili MV 视频视图 -->
        <div
          v-if="srcKind === 'video' && srcUrl && current"
          :key="`video-${currentIndex}`"
          class="stage-fill"
        >
          <video
            ref="videoEl"
            class="video"
            :src="srcUrl"
            playsinline
            preload="auto"
            @play="paused = false"
            @pause="paused = true"
            @ended="onEnded"
            @timeupdate="onTimeUpdate"
            @loadedmetadata="onMediaReady"
            @error="onMediaError"
            @click="togglePlay"
          />
          <!-- 暂停 / 未开始时显示大播放键 -->
          <button
            v-if="paused"
            class="play-btn"
            type="button"
            aria-label="开始播放"
            @click.stop="togglePlay"
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8.5 5.8a1 1 0 0 1 1.52-.85l9.7 6.2a1 1 0 0 1 0 1.7l-9.7 6.2a1 1 0 0 1-1.52-.85V5.8Z" />
            </svg>
          </button>
        </div>

        <!-- 网易云音乐视图（Apple Music 风格：封面色彩模糊背景 + 歌词 + 进度控制） -->
        <div
          v-else-if="srcKind === 'audio' && srcUrl && current"
          :key="`audio-${currentIndex}`"
          class="music-stage"
        >
          <audio
            ref="audioEl"
            :src="srcUrl"
            preload="auto"
            @play="paused = false"
            @pause="paused = true"
            @ended="onEnded"
            @timeupdate="onTimeUpdate"
            @loadedmetadata="onMediaReady"
            @error="onMediaError"
          />

        <!-- 封面色彩模糊背景 -->
        <div class="amt-bg" aria-hidden="true">
          <img :src="current.music.cover" alt="" class="amt-bg-img" />
          <div class="amt-scrim" />
        </div>

        <!-- 左列：封面 + 信息 + 进度 + 控制 -->
        <div class="ami-panel">
          <MediaCover
            class="amt-cover"
            :src="current.music.cover"
            :alt="current.music.title"
            :seed="current.music.title"
          />
          <h2 class="amt-song" :title="current.music.title">{{ current.music.title }}</h2>
          <p class="amt-artist">
            {{ current.music.artist || '未知歌手' }}<span v-if="current.music.album"> · {{ current.music.album }}</span>
          </p>

          <!-- 进度条（仅展示进度，不可调整播放位置） -->
          <div class="amt-progress" aria-hidden="true">
            <div class="amt-track">
              <div class="amt-fill" :style="{ width: `${progressPct}%` }" />
            </div>
            <div class="amt-times">
              <span class="amt-time">{{ fmtTime(curTime) }}</span>
              <span class="amt-time">{{ fmtTime(durTime) }}</span>
            </div>
          </div>

          <!-- 控制：仅 切换歌曲 + 开始暂停 -->
          <div class="ami-controls">
            <button
              class="ami-ctl"
              type="button"
              :disabled="!hasPrev"
              aria-label="上一首"
              @click="requestSwitch(currentIndex - 1)"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M16.5 5.8a1 1 0 0 0-1.52-.85L5.9 11.15a1 1 0 0 0 0 1.7l9.08 6.2a1 1 0 0 0 1.52-.85V5.8Z" fill="currentColor" />
                <path d="M18.5 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
            <button
              class="ami-play"
              type="button"
              :aria-label="paused ? '开始播放' : '暂停'"
              @click="togglePlay"
            >
              <svg v-if="paused" width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8.5 5.8a1 1 0 0 1 1.52-.85l9.7 6.2a1 1 0 0 1 0 1.7l-9.7 6.2a1 1 0 0 1-1.52-.85V5.8Z" />
              </svg>
              <svg v-else width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="7" y="5.5" width="3.4" height="13" rx="1.4" />
                <rect x="13.6" y="5.5" width="3.4" height="13" rx="1.4" />
              </svg>
            </button>
            <button
              class="ami-ctl"
              type="button"
              :disabled="!hasNext"
              aria-label="下一首"
              @click="requestSwitch(currentIndex + 1)"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7.5 5.8a1 1 0 0 1 1.52-.85l9.08 6.2a1 1 0 0 1 0 1.7l-9.08 6.2a1 1 0 0 1-1.52-.85V5.8Z" fill="currentColor" />
                <path d="M5.5 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <!-- 右列：歌词 -->
        <div class="lyrics">
          <div v-if="lyricLines.length" class="lyric-scroll">
            <p
              v-for="(l, i) in lyricLines"
              :key="i"
              ref="lyricEls"
              class="lyric-line"
              :class="{ active: i === lyricIndex }"
            >
              {{ l.text }}
            </p>
          </div>
          <p v-else class="stage-hint">暂无歌词</p>
        </div>
        </div>
      </Transition>
    </div>

    <!-- 底部控制栏（bilibili 视频视图；网易云音乐视图控制已内嵌面板） -->
    <Transition name="bar">
      <footer v-if="srcKind !== 'audio'" class="bar">
      <div class="now">
        <p class="now-title" :title="currentTitle">
          <span v-if="current" class="badge" :class="SOURCE_META[current.music.source].className">
            {{ SOURCE_META[current.music.source].label }}
          </span>
          {{ currentTitle || (loading ? '正在加载课程歌曲…' : '未选择课程') }}
        </p>
        <p v-if="current" class="now-meta">
          {{ current.music.artist || '未知歌手' }}
          <template v-if="current.music.up"> · UP：{{ current.music.up }}</template>
          <template v-if="current.music.album"> · 《{{ current.music.album }}》</template>
          · 第 {{ currentIndex + 1 }} / {{ items.length }} 首
        </p>
      </div>

      <div class="controls">
        <button
          class="btn btn-secondary btn-lg control"
          type="button"
          :disabled="!hasPrev || !srcUrl"
          @click="requestSwitch(currentIndex - 1)"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M16.5 5.8a1 1 0 0 0-1.52-.85L5.9 11.15a1 1 0 0 0 0 1.7l9.08 6.2a1 1 0 0 0 1.52-.85V5.8Z" fill="currentColor" />
            <path d="M18.5 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          上一首
        </button>
        <button
          class="btn btn-primary btn-lg control play-toggle"
          type="button"
          :disabled="!srcUrl"
          aria-label="开始或暂停"
          @click="togglePlay"
        >
          <svg v-if="paused" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8.5 5.8a1 1 0 0 1 1.52-.85l9.7 6.2a1 1 0 0 1 0 1.7l-9.7 6.2a1 1 0 0 1-1.52-.85V5.8Z" />
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="7" y="5.5" width="3.4" height="13" rx="1.2" />
            <rect x="13.6" y="5.5" width="3.4" height="13" rx="1.2" />
          </svg>
          {{ paused ? '开始' : '暂停' }}
        </button>
        <button
          class="btn btn-secondary btn-lg control"
          type="button"
          :disabled="!hasNext || !srcUrl"
          @click="requestSwitch(currentIndex + 1)"
        >
          下一首
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7.5 5.8a1 1 0 0 1 1.52-.85l9.08 6.2a1 1 0 0 1 0 1.7l-9.08 6.2a1 1 0 0 1-1.52-.85V5.8Z" fill="currentColor" />
            <path d="M5.5 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      </footer>
    </Transition>
  </div>
</template>

<style scoped>
.page-play {
  display: flex;
  flex-direction: column;
  max-width: none;
  height: 100vh;
  padding: 0;
  background: #000;
}

/* ============ VIP 尊享提示（顶部横幅） ============ */

.vip-banner {
  position: fixed;
  top: max(20px, env(safe-area-inset-top));
  left: 50%;
  translate: -50% 0;
  z-index: 95;
  display: flex;
  align-items: center;
  gap: 11px;
  max-width: min(92vw, 760px);
  padding: 12px 24px;
  border-radius: 999px;
  background: rgba(28, 28, 30, 0.82);
  -webkit-backdrop-filter: blur(26px) saturate(180%);
  backdrop-filter: blur(26px) saturate(180%);
  color: #fff;
  font-size: clamp(13px, 1.5vw, 15.5px);
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  box-shadow: 0 12px 44px rgba(0, 0, 0, 0.48),
    0 0 0 0.5px rgba(255, 255, 255, 0.14);
}

.vip-icon {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #ff5c5c, #e63946);
  color: #fff;
  box-shadow: 0 3px 12px rgba(230, 57, 70, 0.45);
}

.vip-banner-enter-active {
  transition: opacity 0.4s ease-out, transform 0.55s var(--spring-sheet);
}
.vip-banner-leave-active {
  transition: opacity 0.3s ease-in, transform 0.34s ease-in;
}
/* 自顶部浮现：下滑 + 淡入，离开沿原路收回 */
.vip-banner-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.96);
}
.vip-banner-leave-to {
  opacity: 0;
  transform: translateY(-16px) scale(0.98);
}

.stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  background: #000;
}

.video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

/* 居中覆盖层 */
.stage-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: rgba(255, 255, 255, 0.75);
  background: #000;
}

.stage-cover {
  width: min(320px, 40vw);
  border-radius: 12px;
  overflow: hidden;
  opacity: 0.85;
}

.stage-hint {
  font-size: 15px;
  font-weight: 500;
  max-width: 80vw;
  text-align: center;
}

.spinner.big {
  width: 26px;
  height: 26px;
  border-width: 3px;
}

/* 中央大播放键（视频视图） */
.play-btn {
  position: absolute;
  left: 50%;
  top: 50%;
  translate: -50% -50%;
  z-index: 5;
  width: 92px;
  height: 92px;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.92);
  color: #1d1d1f;
  cursor: pointer;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  transition: transform 0.3s var(--spring-pop), background-color 0.15s ease-out;
}

.play-btn:hover {
  background: #fff;
  transform: scale(1.06);
}

.play-btn:active {
  transform: scale(0.95);
  transition: transform 0.1s ease-out;
}

/* 视图切换过渡：交叉淡入淡出 + 方向滑动（无缩放收敛） */
.stage-fill {
  position: absolute;
  inset: 0;
}

.view-forward-enter-active,
.view-back-enter-active {
  transition: opacity 0.42s ease-out,
    transform 0.55s var(--spring-sheet);
}

.view-forward-leave-active,
.view-back-leave-active {
  transition: opacity 0.32s ease-in,
    transform 0.42s ease-in;
}

/* 下一首：新视图自右侧适度滑入，旧视图向左滑出 */
.view-forward-enter-from {
  opacity: 0;
  transform: translateX(5%);
}

.view-forward-leave-to {
  opacity: 0;
  transform: translateX(-5%);
}

/* 上一首：镜像方向 */
.view-back-enter-from {
  opacity: 0;
  transform: translateX(-5%);
}

.view-back-leave-to {
  opacity: 0;
  transform: translateX(5%);
}

/* 音乐视图成立：背景从黑渐变浮现为封面模糊色（materialize，非硬切） */
.view-forward-enter-active .amt-bg,
.view-back-enter-active .amt-bg {
  animation: bg-reveal 0.72s var(--spring-sheet) both;
}

/* 面板元素依次浮起（staged reveal） */
.view-forward-enter-active .ami-panel,
.view-back-enter-active .ami-panel {
  animation: rise-in 0.5s 0.06s ease-out both;
}

.view-forward-enter-active .lyrics,
.view-back-enter-active .lyrics {
  animation: rise-in 0.5s 0.15s ease-out both;
}

/* 控制键紧随其后出场（与底部控制栏"下沉"方向衔接） */
.view-forward-enter-active .ami-controls,
.view-back-enter-active .ami-controls {
  animation: rise-in 0.5s 0.22s ease-out both;
}

@keyframes bg-reveal {
  from {
    opacity: 0;
    transform: scale(1.06);
  }
}

@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
}

/* 底部控制栏：进入自下浮起 / 离开向下沉没（与控制键进入方向一致） */
.bar-enter-active {
  transition: opacity 0.35s ease-out, transform 0.4s var(--spring-sheet);
}
.bar-leave-active {
  transition: opacity 0.28s ease-in, transform 0.32s ease-in;
}
.bar-enter-from,
.bar-leave-to {
  opacity: 0;
  transform: translateY(26px);
}

/* ============ 网易云音乐视图（Apple Music 风格） ============ */

.music-stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: clamp(24px, 4vw, 64px);
  padding: clamp(20px, 4vh, 48px) clamp(28px, 5vw, 72px);
  overflow: hidden;
}

/* 封面色彩模糊背景 */
.amt-bg {
  position: absolute;
  inset: -40px;
  z-index: 0;
  overflow: hidden;
  background: #121212;
}

.amt-bg-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.35);
  filter: blur(90px) saturate(170%);
  opacity: 0.92;
}

.amt-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.28) 0%,
    rgba(0, 0, 0, 0.42) 55%,
    rgba(0, 0, 0, 0.6) 100%
  );
}

/* 左列面板 */
.ami-panel {
  position: relative;
  z-index: 1;
  flex: none;
  width: min(clamp(240px, 24vw, 360px), 40vh * 0.82);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.amt-cover {
  width: 100%;
  aspect-ratio: 1;
  border-radius: clamp(10px, 1.4vw, 16px);
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
}

.amt-song {
  margin-top: 6px;
  color: #fff;
  font-size: clamp(18px, 1.9vw, 24px);
  font-weight: 700;
  letter-spacing: -0.014em;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.amt-artist {
  margin-top: -4px;
  color: rgba(255, 255, 255, 0.62);
  font-size: clamp(13px, 1.2vw, 15px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 进度条（纯展示） */
.amt-progress {
  margin-top: 8px;
  padding: 10px 0;
  cursor: default;
  user-select: none;
}

.amt-track {
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.26);
  overflow: hidden;
}

.amt-fill {
  height: 100%;
  border-radius: 2px;
  background: #fff;
  transition: width 0.2s linear;
}

.amt-times {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
}

.amt-time {
  color: rgba(255, 255, 255, 0.62);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* 控制：切换 + 开始暂停 */
.ami-controls {
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(20px, 3vw, 40px);
  color: #fff;
}

.ami-ctl {
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  padding: 8px;
  display: grid;
  place-items: center;
  transition: transform 0.28s var(--spring-pop), opacity 0.15s, color 0.15s;
}

.ami-ctl:hover {
  color: #fff;
}

.ami-ctl:active {
  transform: scale(0.88);
  transition: transform 0.1s ease-out;
}

.ami-ctl[disabled] {
  opacity: 0.35;
  pointer-events: none;
}

.ami-play {
  width: 64px;
  height: 64px;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.95);
  color: #1d1d1f;
  cursor: pointer;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.4);
  transition: transform 0.3s var(--spring-pop), background-color 0.15s;
}

.ami-play:hover {
  background: #fff;
  transform: scale(1.05);
}

.ami-play:active {
  transform: scale(0.94);
  transition: transform 0.1s ease-out;
}

/* 歌词区 */
.lyrics {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lyric-scroll {
  width: 100%;
  max-height: 100%;
  overflow-y: auto;
  padding: 34vh clamp(14px, 2.6vw, 44px);
  scrollbar-width: none;
  mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    #000 16%,
    #000 84%,
    transparent 100%
  );
}

.lyric-scroll::-webkit-scrollbar {
  display: none;
}

.lyric-line {
  font-size: clamp(18px, 2.1vw, 26px);
  line-height: 1.95;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.42);
  text-align: left;
  padding: 7px 0;
  transform-origin: left center;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.5),
    0 0 30px rgba(0, 0, 0, 0.35);
  transition: color 0.3s ease-out, transform 0.34s var(--spring-sheet),
    font-weight 0.2s ease-out;
}

.lyric-line.active {
  color: #fff;
  font-weight: 800;
  transform: scale(1.03);
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.85),
    0 0 36px rgba(0, 0, 0, 0.5),
    0 6px 26px rgba(0, 0, 0, 0.55);
}

/* 底部控制栏 */
.bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 28px 18px;
  background: var(--card);
  border-top: 1px solid var(--separator);
}

.now {
  min-width: 0;
}

.now-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.012em;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.now-title .badge {
  flex: none;
}

.now-meta {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.controls {
  flex: none;
  display: flex;
  gap: 12px;
}

.control {
  min-width: 120px;
}

.play-toggle {
  min-width: 128px;
}

@media (max-width: 640px) {
  .page-play {
    height: auto;
    min-height: 100vh;
  }
  .stage {
    min-height: 46vh;
  }
  .music-stage {
    flex-direction: column;
    justify-content: flex-start;
    overflow-y: auto;
    gap: 20px;
  }
  .ami-panel {
    width: min(72vw, 300px);
  }
  .lyrics {
    min-height: 30vh;
  }
  .lyric-scroll {
    padding-top: 12vh;
    padding-bottom: 12vh;
  }
  .bar {
    flex-direction: column;
    align-items: stretch;
  }
  .controls {
    justify-content: center;
  }
  .control {
    flex: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lyric-line {
    transition: color 0.1s ease-out;
  }
  .lyric-line.active {
    transform: none;
  }
}
</style>
