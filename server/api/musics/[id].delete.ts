// DELETE /api/musics/:id —— 删除音乐（级联清除课程分配并重算统计）
import { deleteMusicById } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!id) return { code: -400, message: '缺少音乐 id' }

  try {
    const ok = await deleteMusicById(id)
    if (!ok) return { code: 404, message: '音乐不存在' }
    return { code: 0, message: 'ok' }
  } catch (err: any) {
    return { code: -1, message: '删除音乐失败：' + (err?.message ?? '未知错误') }
  }
})
