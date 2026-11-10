import { expect, type Page, test } from '@playwright/test'

/** E2E: SSR 与客户端首帧一致、事件真的绑上（jsdom 无法覆盖）。 */
/** 主题菜单项文案随 locale 变，抽成表避免在断言里写三元嵌套。 */
const THEME_LABELS = {
  zh: { light: '浅色', dark: '深色' },
  en: { light: 'Light', dark: 'Dark' },
} as const

/**
 * 收集页面上的 React / CSP 报错。
 *
 * 水合失败是 console.error（React 19 打印 "Hydration failed" / "did not match"），
 * 不一定抛成 pageerror，两者都要收。
 */
function collectMessages(page: Page): string[] {
  const messages: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      messages.push(`[${message.type()}] ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => messages.push(`[pageerror] ${error.message}`))
  return messages
}

/** 只留下真正说明「SSR 与客户端不一致」的报错。 */
function hydrationErrors(messages: string[]): string[] {
  return messages.filter((message) => {
    const lower = message.toLowerCase()
    return (
      lower.includes('[pageerror]') ||
      lower.includes('hydrat') ||
      lower.includes('did not match') ||
      lower.includes('invalid dom property') ||
      lower.includes('content security policy')
    )
  })
}

test('zh / en 首页水合无 React / CSP 错误，且主题切换已绑定事件', async ({ page }) => {
  const messages = collectMessages(page)

  for (const locale of ['zh', 'en'] as const) {
    await page.goto(`/${locale}`)
    await page.waitForLoadState('networkidle')

    const html = page.locator('html')
    const before = await html.getAttribute('data-theme')
    const label = locale === 'zh' ? '切换主题' : 'Toggle theme'
    const target = THEME_LABELS[locale][before === 'dark' ? 'light' : 'dark']
    // 冷启动时按钮可能尚未水合：重试打开菜单，已开则不再点（再点会关掉）。
    const trigger = page.getByRole('button', { name: label })
    const option = page.getByRole('menuitemradio', { name: target })
    await expect(async () => {
      if (await option.isVisible()) return
      await trigger.click()
      await expect(option).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 15000 })
    await option.click()
    await expect(html).not.toHaveAttribute('data-theme', before ?? '')
  }

  expect(hydrationErrors(messages), '正文语言及 DOM 应与 SSR 一致').toEqual([])
})

/**
 * 含日期的页面：服务端（Workers 运行时固定 UTC）与浏览器（E2E 固定
 * `Pacific/Honolulu`，UTC-10）时区不同，两端首帧必须渲染出同一段文本。
 *
 * 文章 / 更新日志的日期是 UTC 午夜的内容日期，负偏移下本地渲染会变成前一天——
 * 这正是修复前会触发水合失败的场景。
 */
const DATE_PAGES = [
  { path: '/zh/marketing/blog', date: '2026/11/2' },
  { path: '/en/marketing/blog', date: '11/2/2026' },
  { path: '/zh/marketing/changelog', date: '2026/11/2' },
] as const

test('含日期的页面水合无 React 错误，且日期按 UTC 基准渲染', async ({ page }) => {
  const messages = collectMessages(page)

  for (const { path, date } of DATE_PAGES) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    // 页面确实渲染出了日期，避免「页面空着也算通过」。
    await expect(page.getByText(date).first()).toBeVisible()
  }

  expect(hydrationErrors(messages), '日期渲染在 SSR 与客户端首帧应一致').toEqual([])
})
