#!/usr/bin/env tsx
/**
 * 一键初始化：把这个模板工程变成你自己的项目。
 *
 * 流程刻意拆成四段：**解析参数 → 生成计划 → （交互补充）→ 落盘**。
 * 计划是纯函数，所以 `--dry-run` 打印的就是真正会写下去的东西，
 * 不存在「预览和实际不一致」。
 */

import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { prepareEnvFile } from '../lib/env-file'
import { updateEnv } from '../lib/env-merge'
import { applyPlan, fsIo } from './apply'
import { buildInitEnvUpdates, initEnvValues } from './env'
import {
  buildPlan,
  describePlan,
  type InitConfig,
  MODULE_NAMES,
  type ModuleName,
  resolveConfig,
} from './plan'
import { askConfig } from './questions'

/** 命令行解析结果：配置项全部可选，由 `resolveConfig` 补默认值。 */
export interface ParsedArgs extends Partial<InitConfig> {
  nonInteractive: boolean
  dryRun: boolean
}

/** 需要取值的参数名。 */
const VALUE_FLAGS = ['--name', '--slug', '--domain', '--email', '--modules'] as const

/** 解析 `process.argv.slice(2)`。 */
export function parseArgs(argv: string[]): ParsedArgs {
  const values: Record<string, string> = {}
  const flags = new Set<string>()

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === undefined) continue

    if (arg === '--non-interactive' || arg === '--dry-run') {
      flags.add(arg)
      continue
    }

    const flag = VALUE_FLAGS.find((name) => name === arg)
    if (!flag) throw new Error(`未知参数：${arg}`)

    const value = argv[index + 1]
    if (value === undefined) throw new Error(`参数 ${flag} 缺少取值`)
    values[flag] = value
    index++
  }

  const modules = parseModules(values['--modules'])

  return {
    ...(values['--name'] !== undefined && { name: values['--name'] }),
    ...(values['--slug'] !== undefined && { slug: values['--slug'] }),
    ...(values['--domain'] !== undefined && { domain: values['--domain'] }),
    ...(values['--email'] !== undefined && { email: values['--email'] }),
    ...(modules !== undefined && { modules }),
    nonInteractive: flags.has('--non-interactive'),
    dryRun: flags.has('--dry-run'),
  }
}

/** `--modules docs,blog` → `['docs', 'blog']`；空串即全关。 */
function parseModules(raw: string | undefined): ModuleName[] | undefined {
  if (raw === undefined) return undefined
  if (raw.trim() === '') return []

  return raw.split(',').map((name) => {
    const trimmed = name.trim()
    if (!(MODULE_NAMES as readonly string[]).includes(trimmed)) {
      throw new Error(`未知模块：${trimmed}；可选值：${MODULE_NAMES.join(', ')}`)
    }
    return trimmed as ModuleName
  })
}

/** 跑一次初始化。`io` 与 `cwd` 可注入，便于端到端测试。 */
export async function run(argv: string[], cwd = process.cwd()): Promise<void> {
  const args = parseArgs(argv)
  const resolved = resolveConfig(args, cwd)
  const config = args.nonInteractive ? resolved : await askConfig(resolved)

  const plan = buildPlan(config)
  console.log('\n将要执行的变更：')
  for (const line of describePlan(plan)) console.log(`  - ${line}`)

  if (args.dryRun) {
    console.log('\n--dry-run：未写入任何文件。')
    return
  }

  const result = applyPlan(plan, fsIo)
  for (const path of result.written) console.log(`✅ 已更新 ${path}`)
  for (const path of result.unchanged) console.log(`· 无变化 ${path}`)

  // `.env` 从 `.env.example` 起手，只补空着的键。
  const currentEnv = prepareEnvFile()
  const desired = initEnvValues(config, {
    mailEnabled: config.modules.includes('mail'),
    authSecret: randomBytes(32).toString('base64'),
  })
  const envUpdates = buildInitEnvUpdates({ current: currentEnv, desired })
  if (Object.keys(envUpdates).length > 0) {
    fsIo.write('.env', updateEnv(currentEnv, envUpdates))
    console.log('✅ 已补全 .env')
  }

  console.log('\n下一步：')
  console.log('  pnpm install        安装依赖（若尚未安装）')
  console.log('  pnpm dev            启动开发服务器')
  console.log('  pnpm run setup      创建 Cloudflare 资源并回填 wrangler.jsonc')
}

/**
 * 只有被直接执行时才跑交互流程 —— import 这个模块不该弹提问框。
 */
function isDirectRun(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url.split('?')[0] === pathToFileURL(entry).href
}

if (isDirectRun()) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
