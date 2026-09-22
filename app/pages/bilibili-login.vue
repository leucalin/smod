<script setup lang="ts">
useHead({ title: 'bilibili 登录' })

/**
 * bilibili 扫码登录页（未在侧栏展示，直接访问 /bilibili-login）
 * 登录 cookie 保存在服务端，登录后 MV 搜索与取流会带上登录态。
 */

interface BiliAccount {
  loggedIn: boolean
  uname: string
  face: string
  mid: number | null
  vip: boolean
}

const { showToast } = useToast()

const loading = ref(true)
const account = ref<BiliAccount | null>(null)

const qrImg = ref('')
const qrKey = ref('')
/** 86101 未扫码 / 86090 待确认 / 0 成功 / 86038 已失效 */
const qrState = ref<number>(86101)
const qrLoading = ref(false)

let pollTimer: ReturnType<typeof setTimeout> | null = null

const stateText = computed(() => {
  switch (qrState.value) {
    case 86090:
      return '已扫码，请在手机上确认登录'
    case 0:
      return '登录成功'
    case 86038:
      return '二维码已失效，请刷新'
    default:
      return '请使用 bilibili App 扫描二维码'
  }
})

const stopPolling = () => {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

const loadStatus = async () => {
  try {
    const res = await $fetch<{ code: number; data?: BiliAccount }>(
      '/api/bilibili/login/status',
    )
    account.value = res.code === 0 ? res.data ?? null : null
  } catch {
    account.value = null
  }
}

const pollCheck = async () => {
  if (!qrKey.value) return
  try {
    const res = await $fetch<{
      code: number
      data?: { code: number; message: string; loggedIn: boolean }
    }>('/api/bilibili/login/check', { query: { key: qrKey.value } })
    const state = res.code === 0 ? res.data?.code ?? 86038 : 86038
    qrState.value = state
    if (state === 0) {
      stopPolling()
      await loadStatus()
      showToast('bilibili 登录成功', { kind: 'success' })
      return
    }
    if (state === 86038) {
      stopPolling()
      return
    }
  } catch {
    // 网络抖动继续轮询
  }
  pollTimer = setTimeout(pollCheck, 2000)
}

const createQr = async () => {
  stopPolling()
  qrLoading.value = true
  qrImg.value = ''
  qrKey.value = ''
  try {
    const res = await $fetch<{
      code: number
      message?: string
      data?: { key: string; qrimg: string }
    }>('/api/bilibili/login/qr')
    if (res.code !== 0 || !res.data?.key) {
      throw new Error(res.message || '生成二维码失败')
    }
    qrKey.value = res.data.key
    qrImg.value = res.data.qrimg
    qrState.value = 86101
    pollTimer = setTimeout(pollCheck, 2000)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '生成二维码失败', { kind: 'error' })
  } finally {
    qrLoading.value = false
  }
}

const logout = async () => {
  try {
    await $fetch('/api/bilibili/logout', { method: 'POST' })
    account.value = null
    showToast('已退出 bilibili 登录', { kind: 'success' })
    await createQr()
  } catch {
    showToast('退出失败，请稍后再试', { kind: 'error' })
  }
}

onMounted(async () => {
  await loadStatus()
  loading.value = false
  if (!account.value?.loggedIn) await createQr()
})

onBeforeUnmount(stopPolling)
</script>

<template>
  <div class="page login-page">
    <header class="page-head">
      <div>
        <h1 class="page-title">bilibili 登录</h1>
        <p class="page-subtitle">
          扫码登录后，MV 搜索与播放将使用登录态（登录状态保存在服务端）
        </p>
      </div>
    </header>

    <div class="card login-card">
      <div v-if="loading" class="login-loading">
        <span class="spinner big dark" aria-hidden="true" />
        <p>正在读取登录状态…</p>
      </div>

      <!-- 已登录 -->
      <template v-else-if="account?.loggedIn">
        <div class="account">
          <img
            v-if="account.face"
            class="avatar"
            :src="account.face"
            :alt="account.uname"
            referrerpolicy="no-referrer"
          />
          <div class="account-info">
            <p class="nickname">
              {{ account.uname || 'bilibili 用户' }}
              <span v-if="account.vip" class="vip-badge">大会员</span>
            </p>
            <p class="account-meta">
              <span class="dot-ok" aria-hidden="true" />已登录{{ account.mid ? ` · UID ${account.mid}` : '' }} ·
              全站 MV 播放将使用该账号
            </p>
          </div>
          <button class="btn btn-secondary" type="button" @click="logout">退出登录</button>
        </div>
      </template>

      <!-- 未登录：扫码 -->
      <template v-else>
        <div class="qr-area">
          <div class="qr-frame" :class="{ expired: qrState === 86038 }">
            <img v-if="qrImg" :src="qrImg" alt="bilibili 登录二维码" class="qr-img" />
            <div v-else class="qr-placeholder">
              <span v-if="qrLoading" class="spinner big dark" aria-hidden="true" />
              <span v-else>二维码加载失败</span>
            </div>
            <button
              v-if="qrState === 86038"
              class="qr-refresh"
              type="button"
              @click="createQr"
            >
              点击刷新二维码
            </button>
          </div>
          <p class="qr-state" :class="{ ok: qrState === 0, warn: qrState === 86090 }">
            {{ stateText }}
          </p>
          <p class="qr-tip">
            打开手机「bilibili」→ 我的 → 扫一扫
          </p>
        </div>
      </template>
    </div>

    <p class="login-foot">
      登录信息仅保存在本系统服务端，用于降低 bilibili 接口风控并播放会员视频；不会下发给浏览器。<br />
      若部署在海外服务器，登录不一定能免除风控（bilibili 主要按 IP 归属判断）。
    </p>
  </div>
</template>

<style scoped>
.login-page {
  max-width: 720px;
}

.login-card {
  padding: 28px;
}

.login-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.spinner.big.dark {
  width: 26px;
  height: 26px;
  border-width: 3px;
  border-color: var(--fill-hover);
  border-top-color: var(--accent);
}

/* 已登录账号卡 */
.account {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.account-info {
  flex: 1;
  min-width: 0;
}

.nickname {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.012em;
}

.vip-badge {
  padding: 2px 9px;
  border-radius: 999px;
  background: linear-gradient(135deg, #fb7299, #e63946);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}

.account-meta {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-tertiary);
  font-size: 13px;
}

.dot-ok {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #34c759;
}

/* 二维码区 */
.qr-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.qr-frame {
  position: relative;
  width: 260px;
  height: 260px;
  border-radius: 20px;
  background: #fff;
  box-shadow: var(--shadow-2);
  display: grid;
  place-items: center;
  overflow: hidden;
  transition: filter 0.3s ease-out, opacity 0.3s ease-out;
}

.qr-frame.expired .qr-img {
  filter: blur(6px);
  opacity: 0.5;
}

.qr-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 12px;
}

.qr-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--text-tertiary);
  font-size: 13px;
}

.qr-refresh {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  transition: background-color 0.15s ease-out;
}

.qr-refresh:hover {
  background: rgba(0, 0, 0, 0.45);
}

.qr-state {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  transition: color 0.25s ease-out;
}

.qr-state.ok {
  color: #34c759;
}

.qr-state.warn {
  color: var(--accent);
}

.qr-tip {
  color: var(--text-tertiary);
  font-size: 13px;
}

.login-foot {
  margin-top: 16px;
  color: var(--text-tertiary);
  font-size: 12.5px;
  line-height: 1.6;
}
</style>
