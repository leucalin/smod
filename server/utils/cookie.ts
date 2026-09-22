// 登录 cookie 工具：把接口返回的 Set-Cookie 归一化为 "k=v; k2=v2"

const COOKIE_ATTRS = new Set([
  'path', 'expires', 'domain', 'max-age', 'httponly', 'secure', 'samesite',
])

/** 合并多组 cookie 字符串，后者覆盖前者 */
export function mergeCookieStrings(...sources: string[]): string {
  const map = new Map<string, string>()
  for (const src of sources) {
    if (!src) continue
    for (const part of src.split(';')) {
      const idx = part.indexOf('=')
      if (idx <= 0) continue
      const key = part.slice(0, idx).trim()
      const value = part.slice(idx + 1).trim()
      if (!key || COOKIE_ATTRS.has(key.toLowerCase())) continue
      map.set(key, value)
    }
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

/** 归一化 Set-Cookie 数组/字符串（过滤 Path/Expires 等属性） */
export function normalizeSetCookie(input?: unknown): string {
  if (!input) return ''
  const list = Array.isArray(input) ? input : [input]
  const parts: string[] = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const kv = item.split(';')[0]?.trim()
    if (kv && kv.includes('=')) parts.push(kv)
  }
  return mergeCookieStrings(parts.join('; '))
}
