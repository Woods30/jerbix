import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 必须在导入前 mock node:fs。
vi.mock('node:fs', () => ({
  readFileSync: vi.fn<(filePath: string, encoding: string) => string>(),
  writeFileSync: vi.fn<(filePath: string, content: string) => void>(),
  existsSync: vi.fn<(filePath: string) => boolean>(),
  copyFileSync: vi.fn<(from: string, to: string) => void>(),
}))

// 在 vi.mock 之后导入，mock 才生效。
import { prepareEnvFile } from '../../scripts/setup'

const { readFileSync, existsSync, copyFileSync } = await import('node:fs')

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('prepareEnvFile', () => {
  it('.env 已存在时原样返回，不覆盖', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue('BETTER_AUTH_SECRET=abc123\n')

    expect(prepareEnvFile()).toBe('BETTER_AUTH_SECRET=abc123\n')
    expect(copyFileSync).not.toHaveBeenCalled()
  })

  it('.env 不存在时从 .env.example 复制一份', () => {
    vi.mocked(existsSync).mockImplementation((path) => path === '.env.example')
    vi.mocked(readFileSync).mockReturnValue('# 注释\nBETTER_AUTH_SECRET=\n')

    expect(prepareEnvFile()).toBe('# 注释\nBETTER_AUTH_SECRET=\n')
    expect(copyFileSync).toHaveBeenCalledWith('.env.example', '.env')
  })

  it('.env 与 .env.example 都不存在时抛错', () => {
    vi.mocked(existsSync).mockReturnValue(false)

    expect(() => prepareEnvFile()).toThrow(/\.env\.example/)
  })
})

describe('setup.ts 的模块加载', () => {
  it('被 import 时不触发交互流程', () => {
    const setupUrl = pathToFileURL(join(repoRoot, 'scripts/setup.ts')).href
    const result = spawnSync(
      tsxBin,
      [
        '-e',
        `import(${JSON.stringify(setupUrl)}).then((m) => console.log('EXPORTED:' + typeof m.main)).catch((e) => { console.error(e); process.exit(1) })`,
      ],
      { cwd: repoRoot, encoding: 'utf-8', timeout: 60_000 },
    )

    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('EXPORTED:function')
    // 交互提示一旦被触发，stdout 会出现问题文本。
    expect(result.stdout).not.toContain('项目名')
  })
})
