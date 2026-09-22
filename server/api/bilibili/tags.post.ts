// POST /api/bilibili/tags —— 批量获取 MV 标签（并回写数据库，用于历史数据补全）
// body: { bvids: string[] }
import { getVideoTags } from '../../utils/bilibili'
import { updateMusicTagsByBvid } from '../../utils/db'

const MAX_BATCH = 20
const CONCURRENCY = 3

export default defineEventHandler(async (event) => {
  let body: { bvids?: unknown }
  try {
    body = await readBody(event)
  } catch {
    return { code: -400, message: '请求体不是合法的 JSON' }
  }

  const bvids = Array.isArray(body?.bvids)
    ? body.bvids
        .map((b) => String(b).trim())
        .filter((b) => /^BV[0-9A-Za-z]+$/.test(b))
        .slice(0, MAX_BATCH)
    : []
  if (!bvids.length) return { code: -400, message: '缺少有效的 bvids' }

  const tags: Record<string, string> = {}

  // 限制并发，避免触发 bilibili 风控
  for (let i = 0; i < bvids.length; i += CONCURRENCY) {
    const chunk = bvids.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      chunk.map(async (bvid) => ({ bvid, list: await getVideoTags(bvid) })),
    )
    for (const { bvid, list } of results) {
      if (!list.length) continue
      const joined = list.join(',')
      tags[bvid] = joined
      // 回写数据库（仅在标签为空时写入）
      await updateMusicTagsByBvid(bvid, joined).catch(() => {})
    }
  }

  return { code: 0, message: 'ok', data: { tags } }
})
