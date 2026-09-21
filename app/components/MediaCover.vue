<script setup lang="ts">
// 封面图：加载失败或缺失时回退为渐变底 + 音符图标

const props = withDefaults(
  defineProps<{
    src?: string
    alt?: string
    seed?: string
    /** 正方形封面（网易云等专辑图）；默认 16:9 */
    square?: boolean
  }>(),
  { src: '', alt: '', seed: '', square: false },
)

const failed = ref(false)

const fallbackHue = computed(() => {
  const s = props.seed || props.alt || 'x'
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
})

watch(
  () => props.src,
  () => (failed.value = false),
)
</script>

<template>
  <div class="media-cover" :class="{ square }">
    <img
      v-if="src && !failed"
      :src="src"
      :alt="alt"
      loading="lazy"
      referrerpolicy="no-referrer"
      class="cover-img"
      @error="failed = true"
    />
    <div
      v-else
      class="cover-fallback"
      :style="{
        background: `linear-gradient(135deg, hsl(${fallbackHue} 72% 58% / 0.9), hsl(${(fallbackHue + 48) % 360} 74% 46% / 0.92))`,
      }"
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9 18.5V6.2c0-.4.27-.75.66-.85l8-2.1c.55-.15 1.09.27 1.09.84v12.6"
          stroke="rgba(255,255,255,.9)"
          stroke-width="1.7"
          stroke-linecap="round"
        />
        <circle cx="6.6" cy="18.5" r="2.6" fill="rgba(255,255,255,.92)" />
        <circle cx="16.3" cy="16.7" r="2.6" fill="rgba(255,255,255,.92)" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.media-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--fill);
}

.media-cover.square {
  aspect-ratio: 1;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-fallback {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
}
</style>
