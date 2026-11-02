import { describe, expect, it } from 'vitest'
import { websiteConfig } from '@/config/website'
import { getSitemapPaths, renderSitemapXml } from '@/routes/sitemap[.]xml'

/**
 * sitemap 的 `lastmod`：内容有更新日期时才输出，静态页不编造。
 *
 * 搜索引擎与 AI 抓取器都用它判断「这篇内容是不是新的」，
 * 给静态营销页填一个假日期比不填更糟。
 */

const base = 'https://example.com'

describe('sitemap lastmod', () => {
  it('文档按 frontmatter 的 updated 输出 lastmod', () => {
    const paths = getSitemapPaths(websiteConfig, 'en', {
      blogs: [],
      docs: [{ locale: 'en', _meta: { fileName: 'getting-started.md' }, updated: '2026-10-21' }],
    })
    const entry = paths.find((p) => p.loc === `${base}/en/docs/getting-started`)
    expect(entry?.lastmod).toBe('2026-10-21')
  })

  it('博客按 date 输出 lastmod，只取日期部分', () => {
    const paths = getSitemapPaths(websiteConfig, 'en', {
      blogs: [
        {
          locale: 'en',
          published: true,
          _meta: { path: 'hello-world', fileName: 'hello-world.md' },
          date: '2026-10-12T00:00:00.000Z',
        },
      ],
      docs: [],
    })
    const entry = paths.find((p) => p.loc === `${base}/en/marketing/blog/hello-world`)
    expect(entry?.lastmod).toBe('2026-10-12')
  })

  it('静态页没有日期来源时不输出 lastmod', () => {
    const paths = getSitemapPaths(websiteConfig, 'en', { blogs: [], docs: [] })
    const entry = paths.find((p) => p.loc === `${base}/en/marketing/about`)
    expect(entry).toBeDefined()
    expect(entry?.lastmod).toBeUndefined()
  })

  it('XML 里有 lastmod 时输出该元素，没有时不输出空元素', () => {
    const withDate = renderSitemapXml([
      { loc: `${base}/en/docs/a`, alternates: [], lastmod: '2026-10-21' },
    ])
    expect(withDate).toContain('<lastmod>2026-10-21</lastmod>')

    const withoutDate = renderSitemapXml([{ loc: `${base}/en/docs/b`, alternates: [] }])
    expect(withoutDate).not.toContain('<lastmod>')
  })
})

describe('sitemap 的文档地址', () => {
  it('文档首页只出现在 /docs，不另列 /docs/index', () => {
    // 同一篇内容有两个 URL 时，搜索引擎会挑一个当规范地址，另一个进重复内容池。
    const paths = getSitemapPaths(websiteConfig, 'en', {
      blogs: [],
      docs: [
        { locale: 'en', _meta: { fileName: 'index.md' }, updated: '2026-11-02' },
        { locale: 'en', _meta: { fileName: 'getting-started.md' } },
      ],
    })

    expect(paths.some((p) => p.loc === `${base}/en/docs/index`)).toBe(false)
    expect(paths.some((p) => p.loc === `${base}/en/docs`)).toBe(true)
  })

  it('/docs 的 lastmod 取首页文档的 updated', () => {
    const paths = getSitemapPaths(websiteConfig, 'en', {
      blogs: [],
      docs: [{ locale: 'en', _meta: { fileName: 'index.md' }, updated: '2026-11-02' }],
    })
    const entry = paths.find((p) => p.loc === `${base}/en/docs`)
    expect(entry?.lastmod).toBe('2026-11-02')
  })
})
