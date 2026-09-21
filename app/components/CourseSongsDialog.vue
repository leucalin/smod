<script setup lang="ts">
import type { CourseItem, CourseSongItem } from '~/composables/useMusicStore'
import { SOURCE_META } from '~/composables/useMusicStore'

const props = defineProps<{
  modelValue: boolean
  course?: CourseItem | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const { loadCourseMusics } = useMusicStore()
const { showToast } = useToast()

const open = computed(() => props.modelValue)
const items = ref<CourseSongItem[]>([])
const loading = ref(false)

const close = () => emit('update:modelValue', false)

watch(open, async (v) => {
  document.documentElement.style.overflow = v ? 'hidden' : ''
  if (v && props.course) {
    loading.value = true
    try {
      items.value = await loadCourseMusics(props.course.id)
    } catch (err) {
      items.value = []
      showToast(err instanceof Error ? err.message : '读取歌曲列表失败', {
        kind: 'error',
      })
    } finally {
      loading.value = false
    }
  }
})

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && open.value) close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.documentElement.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="open" class="dialog-overlay" @click.self="close">
        <div class="dialog-card songs-card" role="dialog" aria-modal="true" :aria-label="`课程歌曲列表：${course?.title ?? ''}`">
          <h2 class="dialog-title">课程歌曲列表</h2>
          <p class="dialog-desc">
            {{ course?.title }} · 随机分配的 {{ items.length }} 首歌曲
          </p>

          <!-- 加载骨架 -->
          <div v-if="loading" class="song-list">
            <div v-for="i in 6" :key="i" class="song-row">
              <div class="shimmer thumb-sh" />
              <div class="song-lines">
                <div class="shimmer line-sh w-9" />
                <div class="shimmer line-sh w-5" />
              </div>
            </div>
          </div>

          <!-- 空态 -->
          <div v-else-if="!items.length" class="song-empty">
            <p>该课程暂无歌曲分配（曲库可能为空）</p>
          </div>

          <!-- 列表 -->
          <TransitionGroup v-else name="song-list" tag="ol" class="song-list">
            <li v-for="(it, idx) in items" :key="it.id" class="song-row">
              <span class="song-index" :class="{ played: it.played }">
                {{ it.played ? '✓' : idx + 1 }}
              </span>
              <div class="song-cover">
                <MediaCover :src="it.music.cover" :alt="it.music.title" :seed="it.music.title" />
              </div>
              <div class="song-lines">
                <p class="song-title" :title="it.music.title">{{ it.music.title }}</p>
                <p class="song-meta">
                  {{ it.music.artist || '未知歌手' }}
                  <span v-if="it.music.up"> · {{ it.music.up }}</span>
                </p>
              </div>
              <span
                class="badge song-status"
                :class="it.played ? 'status-played' : 'status-pending'"
              >
                {{ it.played ? '已播放' : '未播放' }}
              </span>
              <span class="song-duration">{{ it.music.duration || '--:--' }}</span>
            </li>
          </TransitionGroup>

          <div class="dialog-actions">
            <button class="btn btn-secondary" type="button" @click="close">关闭</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.songs-card {
  width: min(560px, 100%);
}

.song-list {
  margin-top: 18px;
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: min(52vh, 480px);
  overflow-y: auto;
  padding-right: 2px;
}

.song-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 12px;
  transition: background-color 0.14s ease-out;
}

.song-row:hover {
  background: var(--fill);
}

.song-index {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-tertiary);
  background: var(--fill);
  font-variant-numeric: tabular-nums;
}

.song-index.played {
  background: rgba(52, 199, 89, 0.14);
  color: #34c759;
}

.song-cover {
  flex: none;
  width: 64px;
  border-radius: 8px;
  overflow: hidden;
}

.song-cover :deep(.media-cover) {
  aspect-ratio: 16 / 9;
}

.song-lines {
  flex: 1;
  min-width: 0;
}

.song-title {
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: -0.005em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-meta {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-status {
  flex: none;
  font-size: 11px;
  padding: 3px 9px;
}

.status-played {
  background: #34c759;
}

.status-pending {
  background: var(--local);
}

.song-duration {
  flex: none;
  font-size: 12px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.song-empty {
  margin-top: 18px;
  padding: 36px 20px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
  border: 1.5px dashed var(--separator);
  border-radius: 14px;
}

.thumb-sh {
  width: 64px;
  height: 36px;
  border-radius: 8px;
}

.song-lines .line-sh {
  height: 11px;
}

.song-lines .w-9 {
  width: 82%;
}
.song-lines .w-5 {
  width: 46%;
}

.song-list-enter-active {
  transition: opacity 0.25s ease-out, transform 0.3s var(--spring-sheet);
}
.song-list-leave-active {
  transition: opacity 0.15s ease-in;
}
.song-list-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.song-list-leave-to {
  opacity: 0;
}
</style>
