// PUT /api/courses/:id —— 重新配置课程（清空旧分配并重新随机）
// body: { title, date?, count }
import { reconfigureCourse } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!id) return { code: -400, message: '缺少课程 id' }

  let body: Record<string, any>
  try {
    body = await readBody(event)
  } catch {
    return { code: -400, message: '请求体不是合法的 JSON' }
  }
  if (!body?.title) return { code: -400, message: '缺少课程标题 title' }

  try {
    const course = await reconfigureCourse(id, body)
    if (!course) return { code: 404, message: '课程不存在' }
    return { code: 0, message: 'ok', data: { item: course } }
  } catch (err: any) {
    return { code: -1, message: '重新配置课程失败：' + (err?.message ?? '未知错误') }
  }
})
