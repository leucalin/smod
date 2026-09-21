import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * 网易云 API 模块（@neteasecloudmusicapienhanced/api）通过 readdir + 动态 require
 * 加载内部模块，Nitro 的依赖追踪（nft）无法静态发现这些文件。
 * 这里显式收集其全部 JS 文件作为追踪入口，确保生产构建（含 Vercel）中包含该依赖。
 */
function collectJsFiles(dir: string, out: string[] = []): string[] {
  try {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) collectJsFiles(path, out)
      else if (path.endsWith('.js')) out.push(path)
    }
  } catch {
    // 未安装该依赖时忽略
  }
  return out
}

const ncmEntryFiles = collectJsFiles(
  resolve(process.cwd(), 'node_modules/@neteasecloudmusicapienhanced/api'),
).map((p) => p.replace(/\\/g, '/'))

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
    },
  },
  routeRules: {
    '/': { redirect: '/music' },
  },
  nitro: {
    externals: {
      // 确保网易云 API 模块及其依赖被打进服务端产物
      traceInclude: ncmEntryFiles,
    },
  },
})
