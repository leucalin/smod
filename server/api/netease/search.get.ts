// GET /api/netease/search?keywords=xxx&page=1 —— 网易云歌曲搜索
import { neteaseSearch } from '../../utils/netease'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const keywords = String(query.keywords ?? '').trim()
  const page = Math.max(1, Math.min(50, Number(query.page) || 1))
  if (!keywords) return { code: -400, message: '缺少搜索关键词 keywords' }

  try {
    const data = await neteaseSearch(keywords, page)
    return { code: 0, message: 'ok', data }
  } catch (err: any) {
    return { code: -1, message: '网易云搜索失败：' + (err?.message ?? '未知错误') }
  }
})
