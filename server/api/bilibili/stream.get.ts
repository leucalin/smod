// GET /api/bilibili/stream?bvid=xxx —— bilibili MV 视频流代理
// 视频流 CDN 按浏览器指纹头（UA/sec-ch-ua/Referer）校验防盗链，
// 前端 <video> 直连会被 403，故由服务端带完整头部转发并透传 Range
import { getStreamUrl, streamHeaders } from '../../utils/bilibili'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const bvid = String(query.bvid ?? '').trim()
  if (!bvid) {
    throw createError({ statusCode: 400, statusMessage: '缺少 bvid 参数' })
  }

  const info = await getStreamUrl(bvid)
  if (!info) {
    throw createError({ statusCode: 502, statusMessage: '获取视频播放地址失败' })
  }

  const range = getHeader(event, 'range')
  const upstream = await fetch(info.url, {
    headers: {
      ...streamHeaders(bvid),
      ...(range ? { Range: range } : {}),
    },
    redirect: 'follow',
  })

  if (!upstream.ok && upstream.status !== 206) {
    throw createError({ statusCode: 502, statusMessage: `bilibili 视频服务器返回 ${upstream.status}` })
  }

  // 透传媒体响应头
  setResponseStatus(event, upstream.status)
  const ct = upstream.headers.get('content-type')
  if (ct) setHeader(event, 'content-type', ct)
  const cl = upstream.headers.get('content-length')
  if (cl) setHeader(event, 'content-length', cl)
  const cr = upstream.headers.get('content-range')
  if (cr) setHeader(event, 'content-range', cr)
  const ar = upstream.headers.get('accept-ranges')
  if (ar) setHeader(event, 'accept-ranges', ar)

  return new Response(upstream.body as ReadableStream, {
    status: upstream.status,
    headers: {
      'content-type': ct ?? 'video/mp4',
      ...(cr ? { 'content-range': cr } : {}),
      ...(ar ? { 'accept-ranges': ar } : {}),
    },
  })
})
