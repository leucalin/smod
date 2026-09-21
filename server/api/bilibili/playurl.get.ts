// GET /api/bilibili/playurl?bvid=xxx —— 获取 bilibili MV 的 MP4 播放直链
// 视频流 CDN 无防盗链且媒体加载不受 CORS 限制，前端 <video> 可直连播放
import { getStreamUrl, antiCrawlHint } from '../../utils/bilibili'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const bvid = String(query.bvid ?? '').trim()
  if (!bvid) return { code: -400, message: '缺少 bvid 参数' }

  try {
    const info = await getStreamUrl(bvid)
    if (!info) {
      return {
        code: -1,
        message: `获取视频播放地址失败（可能为会员专属视频，或请求被 bilibili 拦截）${antiCrawlHint()}`,
      }
    }
    return { code: 0, message: 'ok', data: info }
  } catch (err: any) {
    return {
      code: -1,
      message: `${err?.statusMessage ?? err?.message ?? '未知错误'}${antiCrawlHint()}`,
    }
  }
})
