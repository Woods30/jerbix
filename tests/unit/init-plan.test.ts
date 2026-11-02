import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyPlan } from '../../scripts/init/apply'
import { buildPlan, type InitConfig, replaceConfigLiteral } from '../../scripts/init/plan'

/**
 * init 的「计划 / 执行」分离。
 *
 * `buildPlan` 是纯函数：同一份配置永远产出同一份变更清单，因此可以在单测里断言
 * 「改了哪些文件、改成什么」。`applyPlan` 只负责把清单落到磁盘。
 *
 * 之所以要这样拆：真正容易出错的地方（品牌替换漏了、JSONC 注释被抹掉、重跑一次
 * 把值改坏）全在计划里，把它们放进纯函数才能用单测守住。
 */

const CONFIG: InitConfig = {
  name: 'Acme',
  slug: 'acme',
  domain: 'acme.dev',
  email: 'hello@acme.dev',
  modules: [],
}

// 直接用真实配置文件：配置项改名时这里会立刻红，而不是等到跑 init 才发现。
const WEBSITE = readFileSync(new URL('../../src/config/website.ts', import.meta.url), 'utf-8')

const WRANGLER = `{
  // Worker 名决定线上地址。
  "name": "jerbix",
  "compatibility_date": "2026-10-01",
  // 自定义域名。
  "routes": [{ "pattern": "www.jerbix.site", "custom_domain": true }],
  // ID 由 \`wrangler d1 create\` 产出后手工回填。
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "saas-template-db",
      "database_id": "f0aed9d8-0cca-4cb7-9ec6-be6b67ce7e69",
      "migrations_dir": "./src/db/migrations"
    }
  ],
  "kv_namespaces": [{ "binding": "CACHE", "id": "42041d2cc3e84a378f3e264591790a3b" }]
}
`

const PACKAGE_JSON = `{
  "name": "saas-template",
  "version": "0.8.1",
  "private": true
}
`

/** 内存里的仓库：路径 → 内容。 */
function memoryRepo(files: Record<string, string>) {
  const store = new Map(Object.entries(files))
  return {
    read: (path: string) => store.get(path) ?? '',
    write: (path: string, content: string) => void store.set(path, content),
    get: (path: string) => store.get(path),
  }
}

const REPO = {
  'package.json': PACKAGE_JSON,
  'wrangler.jsonc': WRANGLER,
  'src/config/website.ts': WEBSITE,
}

describe('replaceConfigLiteral', () => {
  it("替换唯一一处 `key: 'value'`", () => {
    expect(replaceConfigLiteral(WEBSITE, 'name', 'Acme')).toContain("name: 'Acme',")
  })

  it('已经是目标值时原样返回', () => {
    const once = replaceConfigLiteral(WEBSITE, 'name', 'Acme')

    expect(replaceConfigLiteral(once, 'name', 'Acme')).toBe(once)
  })

  it('匹配不到时抛错，避免静默什么都没改', () => {
    expect(() => replaceConfigLiteral(WEBSITE, 'nope', 'x')).toThrow(/nope/)
  })

  it('匹配到多处时抛错，避免改错地方', () => {
    const twice = `${WEBSITE}\nconst other = { name: 'Another' }\n`

    expect(() => replaceConfigLiteral(twice, 'name', 'Acme')).toThrow(/2 处/)
  })

  it('新值含单引号时抛错，而不是产出语法错误的 TypeScript', () => {
    expect(() => replaceConfigLiteral(WEBSITE, 'name', "O'Brien")).toThrow(/引号/)
  })

  it('能改同一行内的属性（supportEmail）', () => {
    expect(replaceConfigLiteral(WEBSITE, 'supportEmail', 'hello@acme.dev')).toContain(
      "supportEmail: 'hello@acme.dev'",
    )
  })
})

describe('buildPlan', () => {
  const plan = buildPlan(CONFIG)

  it('计划覆盖包名、站点配置与部署配置', () => {
    expect(plan.files.map((file) => file.path)).toEqual([
      'package.json',
      'src/config/website.ts',
      'wrangler.jsonc',
    ])
  })

  it('每个变更都带一句说明，供 --dry-run 展示', () => {
    for (const file of plan.files) expect(file.description.length).toBeGreaterThan(0)
  })

  it('package.json 的 name 改成 slug', () => {
    const file = plan.files.find((entry) => entry.path === 'package.json')

    expect(JSON.parse(file?.transform(PACKAGE_JSON) ?? '{}').name).toBe('acme')
  })

  it('站点名、字标强调段与支持邮箱一起改', () => {
    const file = plan.files.find((entry) => entry.path === 'src/config/website.ts')
    const result = file?.transform(WEBSITE) ?? ''

    expect(result).toContain("name: 'Acme',")
    // 强调段是 Jerbix 的品牌装置，新项目默认没有。
    expect(result).toContain("logoAccent: '',")
    expect(result).toContain("supportEmail: 'hello@acme.dev'")
  })

  it('wrangler.jsonc 改 Worker 名、域名与资源名，ID 置为占位符', () => {
    const file = plan.files.find((entry) => entry.path === 'wrangler.jsonc')
    const result = file?.transform(WRANGLER) ?? ''

    expect(result).toContain('"name": "acme"')
    expect(result).toContain('"pattern": "acme.dev"')
    expect(result).toContain('"database_name": "acme-db"')
    // 资源 ID 是账号相关的，init 不可能知道，留占位符交给部署流程回填。
    expect(result).not.toContain('f0aed9d8-0cca-4cb7-9ec6-be6b67ce7e69')
    expect(result).not.toContain('42041d2cc3e84a378f3e264591790a3b')
    expect(result).toContain('REPLACE_ME')
  })

  it('wrangler.jsonc 的注释原样保留', () => {
    const file = plan.files.find((entry) => entry.path === 'wrangler.jsonc')
    const result = file?.transform(WRANGLER) ?? ''

    expect(result).toContain('// Worker 名决定线上地址。')
    expect(result).toContain('// ID 由 `wrangler d1 create` 产出后手工回填。')
    expect(result).toContain('"migrations_dir": "./src/db/migrations"')
  })
})

describe('applyPlan', () => {
  it('只写入内容真的变了的文件', () => {
    const repo = memoryRepo(REPO)
    const result = applyPlan(buildPlan(CONFIG), repo)

    expect(result.written.sort()).toEqual([
      'package.json',
      'src/config/website.ts',
      'wrangler.jsonc',
    ])
    expect(repo.get('package.json')).toContain('"name": "acme"')
  })

  it('幂等：同一份配置跑第二次不再改动任何文件', () => {
    const repo = memoryRepo(REPO)
    applyPlan(buildPlan(CONFIG), repo)

    const second = applyPlan(buildPlan(CONFIG), repo)

    expect(second.written).toEqual([])
    expect(second.unchanged.sort()).toEqual([
      'package.json',
      'src/config/website.ts',
      'wrangler.jsonc',
    ])
  })

  it('计划里同一文件出现两次时抛错', () => {
    // 后一项会基于原始内容重算，把前一项的结果覆盖掉。
    const duplicated = {
      files: [
        { path: 'a.ts', description: 'x', transform: (s: string) => `${s}1` },
        { path: 'a.ts', description: 'y', transform: (s: string) => `${s}2` },
      ],
    }

    expect(() => applyPlan(duplicated, memoryRepo({ 'a.ts': 'x' }))).toThrow(/重复/)
  })

  it('文件缺失时抛错，且不会留下改了一半的文件', () => {
    const repo = memoryRepo({
      'package.json': PACKAGE_JSON,
      'src/config/website.ts': WEBSITE,
    })

    expect(() => applyPlan(buildPlan(CONFIG), repo)).toThrow(/wrangler\.jsonc/)
    // 前面两个文件虽然算得出结果，但不能已经落盘。
    expect(repo.get('package.json')).toBe(PACKAGE_JSON)
  })
})
