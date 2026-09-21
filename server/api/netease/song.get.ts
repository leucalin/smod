// GET /api/netease/song?id=xxx —— 网易云歌曲播放直链（登录时默认请求无损音质）
import { neteaseSongUrl, isNeteaseLoggedIn } from '../../utils/netease'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const id = String(query.id ?? '').trim()
  if (!id) return { code: -400, message: '缺少歌曲 id' }

  try {
    const info = await neteaseSongUrl(id)
    if (!info) return { code: -1, message: '获取播放地址失败（可能为 VIP 或无版权歌曲）' }
    const loggedIn = await isNeteaseLoggedIn()
    return {
      code: 0,
      message: 'ok',
      data: {
        url: info.url,
        level: info.level,
        br: info.br,
        fee: info.fee,
        /** 是否以无损音质播放（说明动用了会员权益，用于顶部 VIP 提示） */
        vip: loggedIn && info.lossless,
      },
    }
  } catch (err: any) {
    return { code: -1, message: '获取播放地址异常：' + (err?.message ?? '未知错误') }
  }
})
