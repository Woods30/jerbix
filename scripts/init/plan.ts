/**
 * init 的变更计划：**纯函数**，配置进、变更清单出。
 *
 * 为什么要把计划和执行拆开：真正容易出错的地方（品牌替换漏了、JSONC 注释被抹掉、
 * 重跑一次把值改坏）全在「改成什么」这一步。把它做成纯函数，才能在单测里直接断言
 * 目标内容，而不是跑完脚本再回头翻文件。
 *
 * 每个计划项携带一个 `transform`：读入当前内容、返回新内容。这样计划本身不依赖
 * 磁盘，执行时才读文件，幂等性也由「新内容 === 当前内容」自然得到。
 */

import { setJsoncValue } from '../lib/jsonc-edit'

/** 一次初始化所需的全部输入。 */
export interface InitConfig {
  /** 站点展示名，如 `Acme`。 */
  name: string
  /** 小写短名：Cloudflare 资源前缀与包名。 */
  slug: string
  /** 生产域名，如 `acme.dev`。 */
  domain: string
  /** 支持邮箱。 */
  email: string
}

/** 计划里的一个文件变更。 */
export interface PlannedFile {
  /** 仓库内相对路径。 */
  path: string
  /** 一句话说明，供 `--dry-run` 与失败提示展示。 */
  description: string
  /** 纯变换：当前内容 → 新内容。 */
  transform: (current: string) => string
}

export interface InitPlan {
  files: PlannedFile[]
}

/** 资源 ID 是账号相关的，init 无从得知；留占位符交给部署流程回填。 */
const PLACEHOLDER = 'REPLACE_ME'

/**
 * 从配置生成变更清单。
 *
 * 顺序固定（包名 → 站点配置 → 部署配置），`--dry-run` 的输出因此可预期。
 */
export function buildPlan(config: InitConfig): InitPlan {
  return {
    files: [
      {
        path: 'package.json',
        description: `包名改为 ${config.slug}`,
        transform: (current) => setJsonField(current, 'name', config.slug),
      },
      {
        path: 'src/config/website.ts',
        description: `站点名改为 ${config.name}，清空字标强调段，支持邮箱改为 ${config.email}`,
        transform: (current) =>
          applyAll(current, [
            (source) => replaceConfigLiteral(source, 'name', config.name),
            (source) => replaceConfigLiteral(source, 'logoAccent', ''),
            (source) => replaceConfigLiteral(source, 'supportEmail', config.email),
          ]),
      },
      {
        path: 'wrangler.jsonc',
        description: `Worker 名改为 ${config.slug}，域名改为 ${config.domain}，资源 ID 置为占位符`,
        transform: (current) =>
          applyAll(current, [
            (source) => setJsoncValue(source, ['name'], config.slug),
            (source) => setJsoncValue(source, ['routes', 0, 'pattern'], config.domain),
            (source) =>
              setJsoncValue(source, ['d1_databases', 0, 'database_name'], `${config.slug}-db`),
            (source) => setJsoncValue(source, ['d1_databases', 0, 'database_id'], PLACEHOLDER),
            (source) => setJsoncValue(source, ['kv_namespaces', 0, 'id'], PLACEHOLDER),
          ]),
      },
    ],
  }
}

/** 依次套用若干变换；顺序即书写顺序。 */
function applyAll(source: string, steps: Array<(input: string) => string>): string {
  return steps.reduce((current, step) => step(current), source)
}

/**
 * 把源码里 `key: 'value'` 的值换掉，**要求全文件恰好匹配一处**。
 *
 * 匹配数不是 1 就抛错：0 处说明配置项的写法变了（静默跳过等于什么都没做），
 * 多处说明 key 名撞了（改错地方比不改更糟）。
 */
export function replaceConfigLiteral(source: string, key: string, value: string): string {
  if (value.includes("'")) {
    throw new Error(`配置项 ${key} 的新值含单引号，无法写入单引号字符串：${value}`)
  }

  const pattern = new RegExp(`(\\b${key}: )'[^']*'`, 'g')
  const matches = source.match(pattern) ?? []
  if (matches.length !== 1) {
    throw new Error(`配置项 ${key} 在源码里匹配到 ${matches.length} 处，期望恰好 1 处`)
  }

  return source.replace(pattern, `$1'${value}'`)
}

/** 改 JSON 文件的顶层字段，按 2 空格缩进写回（与仓库既有格式一致）。 */
function setJsonField(source: string, key: string, value: unknown): string {
  const parsed = JSON.parse(source) as Record<string, unknown>
  if (!Object.hasOwn(parsed, key)) throw new Error(`JSON 里没有字段 ${key}`)
  parsed[key] = value
  return `${JSON.stringify(parsed, null, 2)}\n`
}

/** 计划的可读摘要，供 `--dry-run` 打印。 */
export function describePlan(plan: InitPlan): string[] {
  return plan.files.map((file) => `${file.path} — ${file.description}`)
}
