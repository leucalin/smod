<script setup lang="ts">
import type { MusicItem } from '~/composables/useMusicStore'
import { SOURCE_META } from '~/composables/useMusicStore'

const props = defineProps<{
  music: MusicItem
}>()

const emit = defineEmits<{
  remove: [music: MusicItem]
}>()

/** MV（bilibili 视频）为竖版 16:9 卡片；其他歌曲为横版 + 正方形封面 */
const isMV = computed(() => Boolean(props.music.bvid))

/** MV 的视频标签（最多展示 3 个，其余以 +N 提示） */
const tagList = computed(() =>
  (props.music.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
)
const visibleTags = computed(() => tagList.value.slice(0, 3))
const restTagCount = computed(() => Math.max(0, tagList.value.length - 3))
</script>

<template>
  <article class="card music-card" :class="{ row: !isMV }">
    <div class="cover-wrap">
      <MediaCover
        :src="music.cover"
        :alt="music.title"
        :seed="music.title"
        :square="!isMV"
      />
      <span class="badge" :class="SOURCE_META[music.source].className">
        {{ SOURCE_META[music.source].label }}
      </span>
      <span v-if="music.duration && isMV" class="duration">{{ music.duration }}</span>
      <button
        class="delete-btn"
        type="button"
        :aria-label="`删除歌曲：${music.title}`"
        title="删除歌曲"
        @click.stop="emit('remove', music)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4.5 7h15M9.5 7V5.2c0-.66.54-1.2 1.2-1.2h2.6c.66 0 1.2.54 1.2 1.2V7m-8.6 0 .9 12.1c.06.75.68 1.33 1.43 1.33h6.94c.75 0 1.37-.58 1.43-1.33L17.5 7M10 11v6M14 11v6"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
    <div class="body">
      <h3 class="title" :title="music.title">{{ music.title }}</h3>

      <!-- MV：展示视频标签与 UP 主（歌手/专辑信息在 MV 中多不可靠） -->
      <template v-if="isMV">
        <div v-if="visibleTags.length" class="tags" :title="tagList.join(' · ')">
          <span v-for="t in visibleTags" :key="t" class="tag">{{ t }}</span>
          <span v-if="restTagCount" class="tag more">+{{ restTagCount }}</span>
        </div>
        <dl class="meta">
          <div v-if="music.up" class="row up">
            <dt>UP 主</dt>
            <dd>{{ music.up }}</dd>
          </div>
        </dl>
      </template>

      <!-- 歌曲（网易云等）：保留歌手 / 专辑信息 -->
      <dl v-else class="meta">
        <div class="row">
          <dt>歌手</dt>
          <dd>{{ music.artist || '未知' }}</dd>
        </div>
        <div class="row">
          <dt>专辑</dt>
          <dd :title="music.album">{{ music.album || '未知' }}</dd>
        </div>
        <div v-if="music.duration" class="row">
          <dt>时长</dt>
          <dd>{{ music.duration }}</dd>
        </div>
      </dl>
    </div>
  </article>
</template>

<style scoped>
.music-card {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.32s var(--spring-pop), box-shadow 0.25s ease-out;
}

.music-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-2);
}

.music-card.row {
  flex-direction: row;
  align-items: center;
}

/* 横版：左侧固定正方形封面 */
.music-card.row .cover-wrap {
  flex: none;
  width: 148px;
  height: 148px;
}

/* 封面撑满显式容器（避免 16:9 高度导致放大裁切） */
.music-card.row .cover-wrap :deep(.media-cover) {
  height: 100%;
  aspect-ratio: auto;
}

.cover-wrap {
  position: relative;
}

.badge {
  position: absolute;
  top: 10px;
  left: 10px;
}

.duration {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

/* 删除按钮：常显于封面右上角 */
.delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(28, 28, 30, 0.62);
  color: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  transition: transform 0.28s var(--spring-pop),
    background-color 0.15s ease-out;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}

.delete-btn:hover {
  background: rgba(255, 59, 48, 0.88);
}

.delete-btn:active {
  transform: scale(0.88);
  transition: transform 0.1s ease-out;
}

.body {
  flex: 1;
  min-width: 0;
  padding: 14px 16px 16px;
}

.music-card.row .body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 16px 18px;
}

.title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.008em;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.7em;
}

.music-card.row .title {
  min-height: 0;
}

.meta {
  margin: 12px 0 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.music-card.row .meta {
  margin-top: 10px;
}

.row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 13px;
  min-width: 0;
}

.row dt {
  flex: none;
  color: var(--text-tertiary);
  font-weight: 500;
}

.row dd {
  margin: 0;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row.up dd {
  color: var(--bili);
  font-weight: 500;
}

/* MV 视频标签 */
.tags {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  max-width: 100%;
  padding: 3px 9px;
  border-radius: 8px;
  background: var(--fill);
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background-color 0.15s ease-out, color 0.15s ease-out;
}

.music-card:hover .tag {
  background: var(--fill-hover);
}

.tag.more {
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
</style>
