import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
// Vite 8 的 configLoader 要求配置内相对导入带扩展名。
import { testScenarioEnv } from './vitest.config.ts'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 与 tsconfig 的 `content-collections` path 对齐：真实 Router 会加载使用
      // content-collections 的路由（如 sitemap / legal），组件测试需要同一别名。
      'content-collections': fileURLToPath(
        new URL('./.content-collections/generated/index.js', import.meta.url),
      ),
    },
  },
  test: {
    name: 'components',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    // 组件测试读的是全局 `websiteConfig`，场景同样固定，不跟 `website.ts` 的出厂值走。
    env: { ...testScenarioEnv },
    include: [
      'tests/components/**/*.test.tsx',
      'tests/components/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    // 变换结果落盘缓存，见 vitest.config.ts 的同名选项。
    fsModuleCache: true,
  },
})
