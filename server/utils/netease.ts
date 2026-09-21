// ============================================================
// 网易云音乐支持
// 默认直接在当前服务进程内调用 NeteaseCloudMusicApiEnhanced 模块
// （@neteasecloudmusicapienhanced/api，无需单独部署 API 服务）；
// 若显式配置 NETEASE_API_BASE，则改为请求该独立部署的服务。
// ============================================================

import { createRequire } from 'node:module'
import { getSetting, setSetting, deleteSetting } from './db'

const NETEASE_BASE = process.env.NETEASE_API_BASE?.replace(/\/$/, '') || ''

const COOKIE_SETTING_KEY = 'netease_cookie'

/**
 * 可选的出口 IP 标识（NETEASE_REAL_IP）
 * 部署在海外节点（如 Vercel 默认区域）时，网易云可能因海外 IP 限制播放或触发风控；
 * 配置一个国内 IP 后，所有请求都会带上 X-Real-IP，等同于从国内发起请求。
 */
const REAL_IP = process.env.NETEASE_REAL_IP?.trim() || ''

/* ---------- 登录态（cookie）管理 ----------
 * 登录 cookie 保存在服务端（Neon app_settings 表；未配置数据库时为进程内存），
 * 与浏览器无关，因此在家登录后到学校打开网页依然是登录状态。
 */

const COOKIE_ATTRS = new Set([
  'path', 'expires', 'domain', 'max-age', 'httponly', 'secure', 'samesite',
])

/** 归一化 NCM 返回的 cookie（数组/字符串）为 "k=v; k2=v2" 形式 */
function normalizeCookie(input?: unknown): string {
  if (!input) return ''
  const list = Array.isArray(input) ? input : [input]
  const map = new Map<string, string>()
  for (const item of list) {
    if (typeof item !== 'string') continue
    for (const part of item.split(';')) {
      const idx = part.indexOf('=')
      if (idx <= 0) continue
      const key = part.slice(0, idx).trim()
      const value = part.slice(idx + 1).trim()
      if (!key || COOKIE_ATTRS.has(key.toLowerCase())) continue
      map.set(key, value)
    }
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

let cookieCache: string | undefined

/** 读取已保存的登录 cookie（服务端持久化） */
export async function getNeteaseCookie(): Promise<string> {
  if (cookieCache !== undefined) return cookieCache
  try {
    cookieCache = (await getSetting(COOKIE_SETTING_KEY)) ?? ''
  } catch {
    cookieCache = ''
  }
  return cookieCache
}

/** 保存/合并登录 cookie */
export async function saveNeteaseCookie(input?: unknown): Promise<string> {
  const incoming = normalizeCookie(input)
  if (!incoming) return await getNeteaseCookie()
  const current = await getNeteaseCookie()
  const merged = new Map<string, string>()
  for (const src of [current, incoming]) {
    for (const part of src.split(';')) {
      const idx = part.indexOf('=')
      if (idx <= 0) continue
      merged.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim())
    }
  }
  const cookie = [...merged.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  cookieCache = cookie
  try {
    await setSetting(COOKIE_SETTING_KEY, cookie)
  } catch (err) {
    console.warn('[netease] 登录 cookie 持久化失败（可能未配置数据库）：', err)
  }
  return cookie
}

/** 清除登录态 */
export async function clearNeteaseCookie(): Promise<void> {
  cookieCache = ''
  try {
    await deleteSetting(COOKIE_SETTING_KEY)
  } catch {
    // 忽略
  }
}

/** 是否已登录（存在 MUSIC_U 即视为已登录） */
export async function isNeteaseLoggedIn(): Promise<boolean> {
  const cookie = await getNeteaseCookie()
  return /(^|;\s*)MUSIC_U=/.test(cookie)
}

type NcmParams = Record<string, unknown>
interface NcmResult {
  status: number
  body: any
}

let ncmModule: Record<string, (p: NcmParams) => Promise<any>> | null | undefined
let ncmWarmedUp = false

/** 进程内加载 NCM 模块（失败返回 null，回退 HTTP 模式） */
function getNcmModule() {
  if (ncmModule !== undefined) return ncmModule
  try {
    const require = createRequire(import.meta.url)
    ncmModule = require('@neteasecloudmusicapienhanced/api')
    // 后台预热一次，避免服务刚启动时首次真实请求返回空结果
    if (!ncmWarmedUp) {
      ncmWarmedUp = true
      Promise.resolve()
        .then(() => ncmModule?.cloudsearch?.({ keywords: '音乐', type: 1, limit: 1 }))
        .catch(() => {})
    }
  } catch (err) {
    console.warn(
      '[netease] 进程内模块加载失败，回退 HTTP 模式：',
      err instanceof Error ? err.message : err,
    )
    ncmModule = null
  }
  return ncmModule
}

/**
 * 统一调用入口：进程内模块优先；NETEASE_API_BASE 已配置或模块不可用时走 HTTP
 * 自动携带已保存的登录 cookie，并把响应中刷新的 cookie 合并保存
 * 瞬时网络抖动（read ECONNRESET 等）自动重试
 * @param name NCM 模块名（如 cloudsearch / song_url / lyric）
 */
async function callNcm(name: string, params: NcmParams): Promise<NcmResult> {
  const cookie = await getNeteaseCookie()

  const attempt = async (): Promise<NcmResult> => {
    const finalParams = REAL_IP ? { ...params, realIP: REAL_IP } : params
    if (!NETEASE_BASE) {
      const mod = getNcmModule()
      const fn = mod?.[name]
      if (typeof fn === 'function') {
        const r = await fn(cookie ? { ...finalParams, cookie } : finalParams)
        // NCM 会返回刷新后的 cookie（如 __csrf），合并保存
        if (Array.isArray(r?.cookie) && r.cookie.length) {
          await saveNeteaseCookie(r.cookie)
        }
        return { status: r?.status ?? 200, body: r?.body ?? r }
      }
    }
    const base = NETEASE_BASE || 'http://127.0.0.1:3100'
    const body = await $fetch(`${base}/${name.replace(/_/g, '/')}`, {
      query: finalParams as Record<string, any>,
      timeout: 15000,
    })
    return { status: 200, body }
  }

  const isTransient = (r: NcmResult) =>
    r.status !== 200 || r.body?.code === 502

  let lastErr: unknown = null
  for (let i = 0; i < 3; i++) {
    try {
      const res = await attempt()
      if (!isTransient(res)) return res
      lastErr = res
    } catch (err) {
      lastErr = err
    }
    // 递增退避：400ms / 800ms
    await new Promise((r) => setTimeout(r, 400 * (i + 1)))
  }
  if (lastErr && typeof lastErr === 'object' && 'status' in lastErr) {
    return lastErr as NcmResult
  }
  throw lastErr instanceof Error ? lastErr : new Error('网易云接口请求失败')
}

export interface NeteaseSearchSong {
  id: string
  title: string
  artist: string
  album: string
  cover: string
  duration: string
  /** 毫秒 */
  durationMs: number
}

export interface LyricLine {
  /** 秒 */
  time: number
  text: string
}

const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  const r = String(s % 60).padStart(2, '0')
  return `${String(m).padStart(2, '0')}:${r}`
}

/** 转 https + 过滤空封面 */
const normCover = (url?: string) =>
  url ? url.replace(/^http:\/\//, 'https://') : ''

/* ---------- 缓存 ---------- */

interface UrlCache {
  info: SongUrlInfo
  at: number
}
const urlCache = new Map<string, UrlCache>()
const URL_TTL = 24 * 60 * 60 * 1000

interface LyricCache {
  lines: LyricLine[]
  at: number
}
const lyricCache = new Map<string, LyricCache>()
const LYRIC_TTL = 60 * 60 * 1000

/* ---------- LRC 解析 ---------- */

const LRC_RE = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\](?:\[[^\]]*\])*([^\[].*)/g

function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = []
  if (!lrc) return out
  for (const m of lrc.matchAll(LRC_RE)) {
    const min = Number(m[1])
    const sec = Number(m[2])
    const fracRaw = m[3] ?? ''
    const frac =
      fracRaw.length === 1
        ? Number(fracRaw) * 100
        : fracRaw.length === 2
          ? Number(fracRaw) * 10
          : Number(fracRaw.padEnd(3, '0'))
    // 剥离文本中残留的时间标签（避免如 “[00:00.39]给我无畏的告白” 的错误显示）
    const text = m[4].replace(/\[[^\]]*\]/g, '').trim()
    if (!text) continue
    out.push({ time: min * 60 + sec + frac / 1000, text })
  }
  return out.sort((a, b) => a.time - b.time)
}

/* ---------- 对外接口 ---------- */

/** 歌曲搜索（cloudsearch，带封面/歌手/专辑/时长） */
export async function neteaseSearch(
  keywords: string,
  page = 1,
): Promise<{ items: NeteaseSearchSong[]; total: number; numPages: number }> {
  const params = { keywords, type: 1, limit: 20, offset: (page - 1) * 20 }
  let res = (await callNcm('cloudsearch', params)).body
  // 偶发返回空结果（如服务刚启动）：稍后重试一次
  if (res?.code === 200 && !res.result?.songs?.length) {
    await new Promise((r) => setTimeout(r, 350))
    res = (await callNcm('cloudsearch', params)).body
  }
  if (res?.code !== 200 || !res.result?.songs) {
    return { items: [], total: 0, numPages: 1 }
  }
  const items = res.result.songs.map((s: any) => ({
    id: String(s.id),
    source: 'netease' as const,
    title: s.name ?? '',
    artist: (s.ar ?? []).map((a: any) => a.name).join(' / ') || '',
    album: s.al?.name ?? '',
    cover: normCover(s.al?.picUrl),
    duration: fmtDuration(Number(s.dt) || 0),
    durationMs: Number(s.dt) || 0,
    neteaseId: Number(s.id),
  }))
  const total = res.result.songCount ?? items.length
  return { items, total, numPages: Math.max(1, Math.ceil(Math.min(total, 10000) / 20)) }
}

/** 达到无损及以上的音质标识 */
const LOSSLESS_LEVELS = new Set(['lossless', 'hires', 'jyeffect', 'sky', 'jymaster'])

export interface SongUrlInfo {
  url: string
  /** 实际返回的音质标识（standard / higher / exhigh / lossless / hires …） */
  level: string
  /** 码率（bps），无损通常 ≥ 900000 */
  br: number
  /** 网易云计费标识：0 免费 / 1 VIP / 4 购买专辑 / 8 低音质免费高音质付费 */
  fee: number
  /** 是否以无损及以上音质播放（即动用了账号的会员权益） */
  lossless: boolean
}

/**
 * 歌曲播放直链（含缓存，24h）
 * 已登录时默认请求无损音质（lossless），网易云会按账号权限自动降级
 */
export async function neteaseSongUrl(id: string): Promise<SongUrlInfo | null> {
  const cached = urlCache.get(id)
  if (cached && Date.now() - cached.at < URL_TTL) return cached.info

  const loggedIn = await isNeteaseLoggedIn()
  const { body: res } = await callNcm('song_url', {
    id,
    ...(loggedIn ? { level: 'lossless' } : {}),
  })
  const item = res?.data?.[0]
  const url = item?.url
  if (!url) return null

  const level = String(item?.level ?? '')
  const br = Number(item?.br ?? 0)
  const info: SongUrlInfo = {
    url,
    level,
    br,
    fee: Number(item?.fee ?? 0),
    lossless: LOSSLESS_LEVELS.has(level) || br >= 900000,
  }
  urlCache.set(id, { info, at: Date.now() })
  return info
}

/** 歌词（解析为 {time, text} 行，含缓存，1h） */
export async function neteaseLyric(id: string): Promise<LyricLine[]> {
  const cached = lyricCache.get(id)
  if (cached && Date.now() - cached.at < LYRIC_TTL) return cached.lines
  const { body: res } = await callNcm('lyric', { id })
  const lines = parseLrc(res?.lrc?.lyric ?? '')
  lyricCache.set(id, { lines, at: Date.now() })
  return lines
}

/* ---------- 扫码登录 ---------- */

export interface QrLoginData {
  key: string
  qrimg: string
  qrurl: string
}

/** 生成登录二维码（key + base64 图片） */
export async function neteaseQrLogin(): Promise<QrLoginData | null> {
  const { body: keyRes } = await callNcm('login_qr_key', { timestamp: Date.now() })
  const key = keyRes?.data?.unikey
  if (!key) return null
  const { body: qrRes } = await callNcm('login_qr_create', {
    key,
    qrimg: true,
    timestamp: Date.now(),
  })
  return {
    key,
    qrimg: qrRes?.data?.qrimg ?? '',
    qrurl: qrRes?.data?.qrurl ?? '',
  }
}

export interface QrCheckResult {
  /** 800 过期 / 801 等待扫码 / 802 待确认 / 803 成功 */
  code: number
  message: string
  loggedIn: boolean
}

/** 轮询扫码状态；成功时保存登录 cookie */
export async function neteaseQrCheck(key: string): Promise<QrCheckResult> {
  const { body } = await callNcm('login_qr_check', { key, noCookie: false, timestamp: Date.now() })
  const code = Number(body?.code ?? 0)
  if (code === 803) {
    // 登录成功：cookie 已由 callNcm 合并保存；再拉一次账号信息
    await neteaseLoginStatus().catch(() => null)
  }
  return {
    code,
    message: body?.message ?? '',
    loggedIn: code === 803,
  }
}

export interface NeteaseAccount {
  loggedIn: boolean
  nickname: string
  avatarUrl: string
  userId: number | null
  vipType: number
}

/** 查询当前登录状态与账号信息 */
export async function neteaseLoginStatus(): Promise<NeteaseAccount> {
  const empty: NeteaseAccount = {
    loggedIn: false,
    nickname: '',
    avatarUrl: '',
    userId: null,
    vipType: 0,
  }
  if (!(await isNeteaseLoggedIn())) return empty
  const { body } = await callNcm('login_status', { timestamp: Date.now() })
  const data = body?.data
  const profile = data?.profile
  if (!profile) return empty
  return {
    loggedIn: true,
    nickname: profile.nickname ?? '',
    avatarUrl: profile.avatarUrl ?? '',
    userId: data?.account?.id ?? profile.userId ?? null,
    vipType: Number(profile.vipType ?? 0),
  }
}

/** 退出登录并清除服务端 cookie */
export async function neteaseLogout(): Promise<void> {
  try {
    await callNcm('logout', { timestamp: Date.now() })
  } catch {
    // 忽略退出接口异常，仍然清除本地 cookie
  }
  await clearNeteaseCookie()
}
