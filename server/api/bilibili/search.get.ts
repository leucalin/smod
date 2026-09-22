// GET /api/bilibili/search?keyword=...&page=1
// bilibili 视频搜索代理（WBI 签名 + buvid 会话），返回前端所需的精简结构
import {
  getBiliSession,
  encWbiQuery,
  biliErrorMessage,
  resetWbiCache,
} from '../../utils/bilibili'

interface SearchResultItem {
  bvid: string
  aid: number
  title: string
  author: string
  pic: string
  duration: string
  play: number
  pubdate: number
  /** 视频标签，逗号分隔 */
  tag?: string
}

/** 去掉 <em class="keyword"> 高亮标签 */
function cleanTitle(title: string): string {
  return title.replace(/<[^>]+>/g, '').trim()
}

/** 时长归一化：'5:27' -> '05:27'，'58:6' -> '58:06' */
function formatDuration(duration: string): string {
  return duration
    .split(':')
    .map((p) => (p.length === 1 ? `0${p}` : p))
    .join(':')
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const keyword = String(query.keyword ?? '').trim()
  const page = Math.max(1, Math.min(50, Number(query.page) || 1))

  if (!keyword) {
    return { code: -400, message: '缺少搜索关键词 keyword' }
  }

  try {
    const session = await getBiliSession()
    const baseParams = {
      search_type: 'video',
      keyword,
      order: 'totalrank',
      page,
    }

    const doSearch = async (signed: string) =>
      $fetch<{
        code: number
        message: string
        data?: {
          numResults?: number
          numPages?: number
          result?: SearchResultItem[]
          v_voucher?: string
        }
      }>(`https://api.bilibili.com/x/web-interface/wbi/search/type?${signed}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Referer: 'https://www.bilibili.com/',
          Cookie: session.cookie,
        },
      })

    let res = await doSearch(await encWbiQuery(baseParams))

    // 签名校验被拦（v_voucher）时，刷新 WBI 密钥重试一次
    if (res.code === 0 && res.data?.v_voucher) {
      resetWbiCache()
      res = await doSearch(await encWbiQuery(baseParams))
    }

    if (res.code === 0 && res.data?.v_voucher) {
      return { code: -403, message: 'bilibili WBI 签名校验异常，请稍后再试' }
    }
    if (res.code !== 0 || !res.data) {
      return { code: res.code, message: biliErrorMessage(res.code, res.message) }
    }

    const items = (res.data.result ?? []).map((item) => ({
      id: item.bvid,
      title: cleanTitle(item.title),
      source: 'bilibili' as const,
      // MV 的歌手/专辑信息大多不可靠，卡片改为展示视频标签
      artist: '',
      album: '',
      tags: (item.tag ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 6)
        .join(','),
      cover: item.pic.startsWith('//') ? `https:${item.pic}` : item.pic,
      up: item.author,
      duration: formatDuration(item.duration ?? ''),
      bvid: item.bvid,
      aid: item.aid,
      play: item.play,
      pubdate: item.pubdate,
    }))

    const total = res.data.numResults ?? items.length
    const numPages =
      res.data.numPages && res.data.numPages > 0
        ? Math.min(res.data.numPages, 50)
        : Math.max(1, Math.ceil(total / 20))

    return { code: 0, message: 'ok', data: { items, page, total, numPages } }
  } catch (err: any) {
    if (err?.statusCode) throw err
    return { code: -1, message: '搜索服务异常：' + (err?.message ?? '未知错误') }
  }
})
