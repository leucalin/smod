// GET /api/netease/lyric?id=xxx —— 网易云歌词（解析为 {time,text} 行）
import { neteaseLyric } from '../../utils/netease'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const id = String(query.id ?? '').trim()
  if (!id) return { code: -400, message: '缺少歌曲 id' }

  try {
    const lines = await neteaseLyric(id)
    return { code: 0, message: 'ok', data: { lines } }
  } catch (err: any) {
    return { code: -1, message: '获取歌词异常：' + (err?.message ?? '未知错误') }
  }
})
