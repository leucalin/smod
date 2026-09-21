<script setup lang="ts">
useHead({ title: '网易云登录' })

/**
 * 网易云扫码登录页（未在侧栏展示，直接访问 /netease-login）
 * 登录 cookie 保存在服务端（配置数据库时持久化），供全站播放使用。
 */

interface AccountInfo {
  loggedIn: boolean
  nickname: string
  avatarUrl: string
  userId: number | null
  vipType: number
}

const { showToast } = useToast()

const loading = ref(true)
const account = ref<AccountInfo | null>(null)

const qrImg = ref('')
const qrKey = ref('')
/** 800 过期 / 801 等待扫码 / 802 待确认 / 803 成功 */
const qrState = ref<800 | 801 | 802 | 803>(801)
const qrLoading = ref(false)

let pollTimer: ReturnType<typeof setTimeout> | null = null

const stateText = computed(() => {
  switch (qrState.value) {
    case 800:
      return '二维码已过期，请刷新'
    case 802:
      return '已扫码，请在手机上确认登录'
    case 803:
      return '登录成功'
    default:
      return '请使用网易云音乐 App 扫描二维码'
  }
})

const vipLabel = computed(() => {
  const t = account.value?.vipType ?? 0
  if (t >= 10) return '黑胶 VIP'
  if (t > 0) return 'VIP'
  return ''
})

/* ---------- 状态与二维码 ---------- */

const loadStatus = async () => {
  try {
    const res = await $fetch<{ code: number; data?: AccountInfo }>(
      '/api/netease/login/status',
    )
    account.value = res.code === 0 ? res.data ?? null : null
  } catch {
    account.value = null
  }
}

const stopPolling = () => {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

const pollCheck = async () => {
  if (!qrKey.value) return
  try {
    const res = await $fetch<{
      code: number
      data?: { code: number; message: string; loggedIn: boolean }
    }>('/api/netease/login/check', { query: { key: qrKey.value } })
    const state = (res.code === 0 ? res.data?.code : 800) ?? 800
    qrState.value = state as 800 | 801 | 802 | 803
    if (state === 803) {
      stopPolling()
      await loadStatus()
      showToast('网易云登录成功', { kind: 'success' })
      return
    }
    if (state === 800) {
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
    }>('/api/netease/login/qr')
    if (res.code !== 0 || !res.data?.key) {
      throw new Error(res.message || '生成二维码失败')
    }
    qrKey.value = res.data.key
    qrImg.value = res.data.qrimg
    qrState.value = 801
    pollTimer = setTimeout(pollCheck, 2000)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '生成二维码失败', { kind: 'error' })
  } finally {
    qrLoading.value = false
  }
}

const logout = async () => {
  try {
    await $fetch('/api/netease/logout', { method: 'POST' })
    account.value = null
    showToast('已退出网易云登录', { kind: 'success' })
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
        <h1 class="page-title">网易云登录</h1>
        <p class="page-subtitle">
          扫码登录后，VIP 歌曲可在本系统内正常播放（登录状态保存在服务端）
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
            v-if="account.avatarUrl"
            class="avatar"
            :src="account.avatarUrl"
            :alt="account.nickname"
            referrerpolicy="no-referrer"
          />
          <div class="account-info">
            <p class="nickname">
              {{ account.nickname || '网易云用户' }}
              <span v-if="vipLabel" class="vip-badge">{{ vipLabel }}</span>
            </p>
            <p class="account-meta">
              <span class="dot-ok" aria-hidden="true" />已登录 · 全站播放将使用该账号
            </p>
          </div>
          <button class="btn btn-secondary" type="button" @click="logout">退出登录</button>
        </div>
      </template>

      <!-- 未登录：扫码 -->
      <template v-else>
        <div class="qr-area">
          <div class="qr-frame" :class="{ expired: qrState === 800 }">
            <img v-if="qrImg" :src="qrImg" alt="网易云登录二维码" class="qr-img" />
            <div v-else class="qr-placeholder">
              <span v-if="qrLoading" class="spinner big dark" aria-hidden="true" />
              <span v-else>二维码加载失败</span>
            </div>
            <button
              v-if="qrState === 800"
              class="qr-refresh"
              type="button"
              @click="createQr"
            >
              点击刷新二维码
            </button>
          </div>
          <p class="qr-state" :class="{ ok: qrState === 803, warn: qrState === 802 }">
            {{ stateText }}
          </p>
          <p class="qr-tip">
            打开手机「网易云音乐」→ 左上角菜单 → 扫一扫
          </p>
        </div>
      </template>
    </div>

    <p class="login-foot">
      登录信息仅保存在本系统服务端，用于获取可播放的音源地址；不会下发给浏览器。<br />
      登录后播放网易云歌曲将默认请求<strong>无损音质</strong>（实际音质取决于账号权益，无权益时自动降级）。
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
  background: linear-gradient(135deg, #ff5c5c, #e63946);
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
