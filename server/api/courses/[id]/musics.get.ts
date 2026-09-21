// GET /api/courses/:id/musics —— 课程随机分配的歌曲列表
import { listCourseMusics } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!id) return { code: -400, message: '缺少课程 id' }

  try {
    const items = await listCourseMusics(id)
    return { code: 0, message: 'ok', data: { items } }
  } catch (err: any) {
    return { code: -1, message: '读取课程歌曲列表失败：' + (err?.message ?? '未知错误') }
  }
})
