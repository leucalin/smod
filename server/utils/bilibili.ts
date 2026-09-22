// ============================================================
// bilibili 搜索服务端支持
// 依据 https://github.com/pskdje/bilibili-API-collect 的
//   docs/search/search_request.md 与 docs/misc/sign/wbi.md 实现：
// - 会话：/x/frontend/finger/spi 获取 buvid3/4（缓存 24h）
// - 签名：/x/web-interface/nav 获取 img_key/sub_key（缓存 12h），
//   经 MIXIN_KEY_ENC_TAB 重排生成 mixin_key，md5(query+mixin_key) 得 w_rid
// ============================================================

import { createHash } from 'node:crypto'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const REFERER = 'https://www.bilibili.com/'

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
]

const md5 = (s: string) => createHash('md5').update(s).digest('hex')

/* ---------- 会话缓存 ---------- */

interface BiliSession {
  cookie: string
  at: number
}

let sessionCache: BiliSession | null = null
const SESSION_TTL = 24 * 60 * 60 * 1000

/** 浏览器化请求头（部分风控接口要求完整指纹头） */
const BROWSER_HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'sec-ch-ua': '"Chromium";v="138", "Google Chrome";v="138", "Not.A/Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
}

/** 视频流转发所需指纹头（防盗链按此校验） */
export function streamHeaders(bvid: string) {
  return {
    ...BROWSER_HEADERS,
    Referer: `https://www.bilibili.com/video/${bvid}`,
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site',
  }
}

/** 获取 buvid（buvid3/buvid4）+ 主页预热 cookie（b_nut），带缓存 */
export async function getBiliSession(): Promise<BiliSession> {
  if (
    sessionCache &&
    Date.now() - sessionCache.at < SESSION_TTL &&
    sessionCache.cookie
  ) {
    return sessionCache
  }
  const res = await $fetch<{ code: number; data?: { b_3?: string; b_4?: string } }>(
    'https://api.bilibili.com/x/frontend/finger/spi',
    { headers: BROWSER_HEADERS },
  )
  if (res.code !== 0 || !res.data?.b_3) {
    throw createError({ statusCode: 502, statusMessage: '无法获取 bilibili 会话（spi）' })
  }
  const cookies: string[] = []
  const seen = new Set<string>()
  const addCookie = (c: string) => {
    const key = c.split('=')[0]
    if (key && !seen.has(key)) {
      seen.add(key)
      cookies.push(c)
    }
  }
  addCookie(`buvid3=${res.data.b_3}`)
  if (res.data.b_4) addCookie(`buvid4=${res.data.b_4}`)

  // 访问主页预热会话 cookie（b_nut 等），降低接口风控概率
  try {
    const home = await fetch('https://www.bilibili.com/', { headers: BROWSER_HEADERS })
    const setCookies = ((home.headers as any).getSetCookie?.() ??
      [home.headers.get('set-cookie')].filter(Boolean)) as string[]
    for (const c of setCookies) {
      const kv = c.split(';')[0]?.trim()
      if (kv && /^(buvid3|buvid4|b_nut|b_lsid|HOME_SSO)/.test(kv)) addCookie(kv)
    }
  } catch {
    // 预热失败不阻塞主流程
  }

  sessionCache = { cookie: cookies.join('; '), at: Date.now() }
  return sessionCache
}

/* ---------- WBI 签名 ---------- */

interface WbiKeys {
  imgKey: string
  subKey: string
}

let wbiCache: (WbiKeys & { at: number }) | null = null
const WBI_TTL = 12 * 60 * 60 * 1000

async function getWbiKeys(): Promise<WbiKeys> {
  if (wbiCache && Date.now() - wbiCache.at < WBI_TTL) {
    return wbiCache
  }
  const session = await getBiliSession()
  const res = await $fetch<{ code: number; data?: { wbi_img?: { img_url?: string; sub_url?: string } } }>(
    'https://api.bilibili.com/x/web-interface/nav',
    { headers: { 'User-Agent': UA, Referer: REFERER, Cookie: session.cookie } },
  )
  const imgUrl = res.data?.wbi_img?.img_url ?? ''
  const subUrl = res.data?.wbi_img?.sub_url ?? ''
  const imgKey = imgUrl.split('/').pop()?.split('.')[0] ?? ''
  const subKey = subUrl.split('/').pop()?.split('.')[0] ?? ''
  if (!imgKey || !subKey) {
    throw createError({ statusCode: 502, statusMessage: '无法获取 bilibili WBI 密钥（nav）' })
  }
  wbiCache = { imgKey, subKey, at: Date.now() }
  return wbiCache
}

/** 强制刷新 WBI 密钥（风控/签名校验失败时重试用） */
export function resetWbiCache() {
  wbiCache = null
}

/** 生成带 w_rid / wts 的签名查询串 */
export async function encWbiQuery(params: Record<string, string | number>): Promise<string> {
  const { imgKey, subKey } = await getWbiKeys()
  const raw = imgKey + subKey
  const mixinKey = MIXIN_KEY_ENC_TAB.map((i) => raw[i]).join('').slice(0, 32)
  const wts = Math.round(Date.now() / 1000)
  const merged = { ...params, wts }
  const query = Object.keys(merged)
    .sort()
    .map((k) => {
      const v = String(merged[k]).replace(/[!'()*]/g, '')
      return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
    })
    .join('&')
  return `${query}&w_rid=${md5(query + mixinKey)}`
}

/* ---------- 错误码翻译 ---------- */

export function biliErrorMessage(code: number, message: string): string {
  if (code === -412) return '搜索请求被 bilibili 风控拦截，请稍后再试'
  if (code === -400) return '搜索参数不合法'
  if (code === -1200) return '搜索目标类型不存在'
  if (message && message !== '0' && message !== 'OK') return message
  return `bilibili 接口返回错误（code=${code}）`
}

/* ---------- 视频流（view + playurl） ---------- */

export interface StreamInfo {
  cid: number
  /** MP4 直链，有效期约 120 分钟 */
  url: string
  /** 视频总时长（毫秒） */
  lengthMs: number
  /** 实际清晰度（qn 标识） */
  quality: number
}

interface StreamCacheEntry extends StreamInfo {
  at: number
}

const STREAM_TTL = 100 * 60 * 1000 // 直链有效期 120min，留余量
const streamCache = new Map<string, StreamCacheEntry>()

/**
 * 获取 bvid 的 MP4 播放直链（旧版 playurl + 完整浏览器头，实测可绕过风控）
 * view 拿 cid → playurl(fnval=1 MP4, qn=64, try_look=1) 拿 durl
 */
export async function getStreamUrl(bvid: string): Promise<StreamInfo | null> {
  const cached = streamCache.get(bvid)
  if (cached && Date.now() - cached.at < STREAM_TTL) {
    return { cid: cached.cid, url: cached.url, lengthMs: cached.lengthMs, quality: cached.quality }
  }

  const session = await getBiliSession()
  const videoReferer = `https://www.bilibili.com/video/${bvid}`
  const headers = { ...BROWSER_HEADERS, Referer: videoReferer, Cookie: session.cookie }

  // 1. 取 cid（稿件信息）
  const view = await $fetch<{
    code: number
    message?: string
    data?: { cid?: number; duration?: number }
  }>(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers })
  if (view.code !== 0 || !view.data?.cid) {
    return null
  }
  const cid = view.data.cid

  // 2. 取 MP4 播放地址（durl；qn=80+try_look 未登录最高可拿 1080P，降级自动）
  const playUrl = await $fetch<{
    code: number
    message?: string
    data?: {
      quality?: number
      durl?: { length?: number; url?: string }[]
    }
  }>(
    `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=1&fourk=0&try_look=1&platform=html5&high_quality=1`,
    { headers },
  )
  const durl = playUrl.data?.durl?.[0]
  if (playUrl.code !== 0 || !durl?.url) {
    return null
  }

  const info: StreamInfo = {
    cid,
    url: durl.url,
    lengthMs: durl.length ?? 0,
    quality: playUrl.data?.quality ?? 0,
  }
  streamCache.set(bvid, { ...info, at: Date.now() })
  return info
}
