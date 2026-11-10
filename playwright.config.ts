import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 本地固定 4：默认的 CPU 核数一半会让多个浏览器在 `vite dev` 按需编译上排队，
  // 导致与代码无关的偶发超时。
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    /**
     * 浏览器时区**故意**与服务端（wrangler dev 的 Workers 运行时固定 UTC）不同。
     *
     * 早先这里固定成 UTC 来绕开水合失败：服务端渲染 UTC 日期、客户端按本地时区
     * 渲染，跨午夜差一天时文本不一致，React 水合失败后整树重生成、页面短暂不可
     * 交互——表现为随机性的「点击被吞」。
     *
     * 日期渲染已统一（SSR 与水合首帧用 UTC 基准值，挂载后再切本地时区，见
     * `src/components/local-date.tsx`），这里改回本地时区正是为了守住这条修复。
     *
     * 选 `Pacific/Honolulu`（UTC-10）而不是本机的 UTC+8：负偏移才会把 UTC 午夜
     * 的内容日期（文章发布日）推到前一天，一退回到「本地时区直接渲染」就必然
     * 水合失败。
     */
    timezoneId: 'Pacific/Honolulu',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: 'pnpm exec tsx e2e/global-setup.ts',
        url: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
        // 现有 dev server 可能接真实 Resend，必须使用测试专属传输层。
        reuseExistingServer: false,
        timeout: 120_000,
      },
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
})
