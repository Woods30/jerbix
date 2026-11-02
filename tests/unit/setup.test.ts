import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx')

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
