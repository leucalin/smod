<script setup lang="ts">
import type { MusicItem } from '~/composables/useMusicStore'

useHead({ title: '音乐列表' })

const { musics, musicsLoading, loadMusics, removeMusic } = useMusicStore()
const { showToast } = useToast()

// SSR + CSR 复用同一份数据
await useAsyncData('music-list-fetch', () => loadMusics())

/* ---------- 删除音乐 ---------- */

const removeTarget = ref<MusicItem | null>(null)
const removeConfirmOpen = computed({
  get: () => removeTarget.value != null,
  set: (v: boolean) => {
    if (!v) removeTarget.value = null
  },
})

const onRemove = async () => {
  const target = removeTarget.value
  if (!target) return
  try {
    await removeMusic(target.id)
    showToast(`已删除「${target.title}」`, { kind: 'success' })
  } catch (err) {
    showToast(err instanceof Error ? err.message : '删除音乐失败', { kind: 'error' })
  }
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">音乐列表</h1>
        <p class="page-subtitle">
          已添加 {{ musics.length }} 首音乐，音源来自 bilibili 用户上传的 MV 与网易云音乐
        </p>
      </div>
    </header>

    <AddMusicCard />

    <h2 class="section-title">
      已添加音乐 <span class="count">{{ musics.length }} 首</span>
    </h2>

    <div v-if="musicsLoading && !musics.length" class="music-grid">
      <div v-for="i in 4" :key="i" class="card loading-card">
        <div class="shimmer cover-sh" />
        <div class="body-sh">
          <div class="shimmer line-sh w-9" />
          <div class="shimmer line-sh w-6" />
        </div>
      </div>
    </div>

    <div v-else-if="musics.length" class="music-grid">
      <MusicCard
        v-for="m in musics"
        :key="m.id"
        :music="m"
        @remove="removeTarget = $event"
      />
    </div>

    <div v-else class="empty-state">
      <div class="glyph">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M9 18.5V6.2c0-.4.27-.75.66-.85l8-2.1c.55-.15 1.09.27 1.09.84v12.6"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
          />
          <circle cx="6.6" cy="18.5" r="2.6" fill="currentColor" />
          <circle cx="16.3" cy="16.7" r="2.6" fill="currentColor" />
        </svg>
      </div>
      <h3>还没有添加音乐</h3>
      <p>在上方搜索 bilibili MV 或网易云音乐，把喜欢的歌曲添加到音乐列表</p>
    </div>

    <ConfirmDialog
      v-model="removeConfirmOpen"
      title="删除歌曲"
      :message="`确定删除「${removeTarget?.title ?? ''}」吗？该歌曲将从音乐列表移除，引用它的课程会自动补充新歌，课程数量与播放进度不受影响。`"
      confirm-text="删除"
      @confirm="onRemove"
    />
  </div>
</template>

<style scoped>
.music-grid {
  /* 不规则流式：横版/竖版卡片按自然高度排列 */
  columns: 232px;
  column-gap: 20px;
}

.music-grid :deep(.music-card) {
  break-inside: avoid;
  margin-bottom: 20px;
}

.loading-card {
  overflow: hidden;
  padding-bottom: 16px;
  break-inside: avoid;
  margin-bottom: 20px;
}

.cover-sh {
  aspect-ratio: 16 / 9;
  border-radius: 0;
}

.body-sh {
  padding: 14px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.line-sh {
  height: 12px;
}

.w-9 {
  width: 92%;
}
.w-6 {
  width: 60%;
}
</style>
