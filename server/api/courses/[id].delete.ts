// DELETE /api/courses/:id —— 删除课程（级联删除歌曲分配）
import { deleteCourseById } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!id) return { code: -400, message: '缺少课程 id' }

  try {
    const ok = await deleteCourseById(id)
    if (!ok) return { code: 404, message: '课程不存在' }
    return { code: 0, message: 'ok' }
  } catch (err: any) {
    return { code: -1, message: '删除课程失败：' + (err?.message ?? '未知错误') }
  }
})
