// POST /api/courses/:id/played —— 播放完成上报
// body: { musicId }
// 标记该曲目已播放、课程已播放数 +1、从音乐列表移除（级联清分配并重算统计）
import { completeCourseMusic } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!id) return { code: -400, message: '缺少课程 id' }

  let body: Record<string, any>
  try {
    body = await readBody(event)
  } catch {
    return { code: -400, message: '请求体不是合法的 JSON' }
  }
  const musicId = String(body?.musicId ?? '')
  if (!musicId) return { code: -400, message: '缺少 musicId' }

  try {
    const ok = await completeCourseMusic(id, musicId)
    if (!ok) return { code: 404, message: '课程不存在' }
    return { code: 0, message: 'ok' }
  } catch (err: any) {
    return { code: -1, message: '上报播放进度失败：' + (err?.message ?? '未知错误') }
  }
})
