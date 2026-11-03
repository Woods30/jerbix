import { afterEach, describe, expect, it } from 'vitest'
import { websiteConfig } from '@/config/website'
import { m } from '@/locale/paraglide/messages.js'
import { overwriteServerAsyncLocalStorage } from '@/locale/paraglide/runtime.js'
import { Route } from '@/routes/{-$locale}/index'

/**
 * 首页 `head()` 的 i18n 回归：曾用模块加载期求值的中文 description，
 * 使英文页面也输出中文。用假 ALS store 复现每请求调用 `head()`。
 */

interface HeadMeta {
  title?: string
  name?: string
  content?: string
}

interface HeadResult {
  meta: HeadMeta[]
}

/** 固定当前请求语言，等价于 `paraglideMiddleware` 按请求写入 ALS。 */
function withRequestLocale(locale: 'zh' | 'en'): void {
  overwriteServerAsyncLocalStorage({
    getStore: () => ({ locale }),
    run: (_store, callback) => callback(),
  })
}

/** 取出路由的 `head()` 并调用（`head` 是每请求调用的函数）。 */
function runHomeHead(): HeadResult {
  const head = Route.options.head as unknown as () => HeadResult
  return head()
}

const originalDocs = { ...websiteConfig.docs }

afterEach(() => {
  overwriteServerAsyncLocalStorage(undefined)
  websiteConfig.docs = { ...originalDocs }
})

describe('首页 head 的 i18n', () => {
  it.each(['zh', 'en'] as const)('%s 首页与 OG 标题明确品牌和产品技术栈', (locale) => {
    withRequestLocale(locale)
    const { meta } = runHomeHead()
    // 标题取自消息：品牌由消息决定（改名后不用改测试），技术栈由文案本身保证。
    const title = m.home_page_title({}, { locale })
    expect(title).toContain('TanStack Start')
    expect(meta).toContainEqual({ title })
    expect(meta).toContainEqual({ property: 'og:title', content: title })
  })
  it('description 随请求语言变化（en 输出英文）', () => {
    withRequestLocale('en')
    const en = runHomeHead()
    expect(en.meta).toContainEqual({
      name: 'description',
      content: m.home_page_description({}, { locale: 'en' }),
    })

    withRequestLocale('zh')
    const zh = runHomeHead()
    expect(zh.meta).toContainEqual({
      name: 'description',
      content: m.home_page_description({}, { locale: 'zh' }),
    })
  })

  it('英文请求不输出中文 description（回归缺陷）', () => {
    withRequestLocale('en')
    const en = runHomeHead()
    const description = en.meta.find((entry) => entry.name === 'description')
    expect(description?.content).not.toMatch(/[㐀-鿿]/u)
  })
})

/**
 * 文档站模式：根路径直接进文档首页。
 *
 * 文档站部署在独立域时，访客来的是文档；根路径给营销首页会让人以为走错了地方。
 */
describe('文档站模式的根路径', () => {
  const beforeLoad = Route.options.beforeLoad as unknown as () => unknown

  it('asHome 开启时根路径跳到文档首页', () => {
    websiteConfig.docs = { ...websiteConfig.docs, asHome: true }
    withRequestLocale('zh')

    let thrown: unknown
    try {
      beforeLoad()
    } catch (error) {
      thrown = error
    }
    const options = (thrown as { options?: { to?: string; params?: unknown } }).options
    expect(options?.to).toBe('/{-$locale}/docs')
    expect(options?.params).toEqual({ locale: 'zh' })
  })

  it('asHome 关闭时根路径正常渲染', () => {
    websiteConfig.docs = { ...websiteConfig.docs, asHome: false }
    expect(beforeLoad()).toBeUndefined()
  })
})
