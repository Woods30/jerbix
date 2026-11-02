/**
 * setup 脚本对 Cloudflare 资源的处理。
 *
 * 三条硬约束：
 *
 * 1. **不碰 R2**。R2 必须先在 Cloudflare Dashboard 开通一次（免费额度内不收费，
 *    但需绑支付方式），API 代劳不了 —— `wrangler r2 bucket list` 与
 *    `POST /r2/buckets` 均返回 code 10042。脚本擅自创建会把「尚未开通」这个
 *    事实藏起来，等到文件上传真的要用时才炸。
 * 2. **不抹注释**。`wrangler.jsonc` 里的注释解释了「资源 ID 是账号相关的、
 *    换账号必须重新绑定」「R2 为什么被注释掉」这类运维前提，整体回写会一并清空。
 * 3. **不拼 shell**。资源名会进到命令行里，必须以 argv 数组下发，不能拼成
 *    字符串交给 shell 解释 —— 拼字符串等于留一个命令注入的口子。
 */

import { setJsoncValue } from './jsonc-edit'

/**
 * 执行一条命令并返回其 stdout；失败时抛错。
 *
 * 参数以数组下发，调用方**不要**把它拼成 shell 字符串。
 */
export type CommandRunner = (command: string, args: string[]) => string

/** 合法的项目名：小写字母、数字、连字符，且不以连字符开头或结尾。 */
const PROJECT_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

/** 项目名是否可用；交互提示与资源创建共用同一条规则。 */
export function isValidProjectName(projectName: string): boolean {
  return PROJECT_NAME.test(projectName)
}

/** setup 在 Cloudflare 账号下建好（或找回）的资源。 */
export interface ProvisionedResources {
  /** D1 资源名。 */
  dbName: string
  /** D1 资源 ID。 */
  dbId: string
  /** KV 命名空间标题。 */
  kvName: string
  /** KV 命名空间 ID。 */
  kvId: string
}

/**
 * 建（或找回）D1 与 KV 命名空间。
 *
 * 资源已存在时从列表里按名字找回 ID —— 重复执行 setup 不该报错，更不该新建
 * 一个同名资源导致账号里堆积重复的库。
 */
export function provisionResources(projectName: string, run: CommandRunner): ProvisionedResources {
  if (!PROJECT_NAME.test(projectName)) {
    throw new Error(`项目名非法：${JSON.stringify(projectName)}；仅允许小写字母、数字、连字符`)
  }

  const dbName = `${projectName}-db`
  const kvName = `${projectName}-cache`

  return {
    dbName,
    dbId: provisionD1(dbName, run),
    kvName,
    kvId: provisionKv(kvName, run),
  }
}

function provisionD1(dbName: string, run: CommandRunner): string {
  try {
    const out = run('wrangler', ['d1', 'create', dbName, '--json'])
    const uuid = (JSON.parse(out) as { uuid?: string }).uuid
    if (!uuid) throw new Error('无法解析新建的 D1 id')
    return uuid
  } catch {
    // 已存在时从 d1 list 解析 id。
    try {
      const list = run('wrangler', ['d1', 'list', '--json'])
      const found = (JSON.parse(list) as Array<{ uuid: string; name: string }>).find(
        (d) => d.name === dbName,
      )
      if (!found) throw new Error('列表里没有同名 D1')
      return found.uuid
    } catch (e) {
      throw new Error(`D1 创建/查找失败：${(e as Error).message}`)
    }
  }
}

function provisionKv(kvName: string, run: CommandRunner): string {
  try {
    const out = run('wrangler', ['kv', 'namespace', 'create', kvName])
    const id = out.match(/id = "([a-f0-9]+)"/)?.[1]
    if (!id) throw new Error('无法解析新建的 KV id')
    return id
  } catch {
    try {
      const list = run('wrangler', ['kv', 'namespace', 'list', '--json'])
      const found = (JSON.parse(list) as Array<{ id: string; title: string }>).find(
        (k) => k.title === kvName,
      )
      if (!found) throw new Error('列表里没有同名 KV')
      return found.id
    } catch (e) {
      throw new Error(`KV 创建/查找失败：${(e as Error).message}`)
    }
  }
}

/** 写回 `wrangler.jsonc` 所需的资源标识。 */
export interface ResourceBindings {
  /** D1 资源名。 */
  dbName: string
  /** D1 资源 ID。 */
  dbId: string
  /** KV 命名空间 ID。 */
  kvId: string
}

/**
 * 把 D1 与 KV 的资源标识定点写回 `wrangler.jsonc`。
 *
 * 只替换目标字段，注释、空白与其它字段原样保留。R2 不在此处理：它必须先在
 * Dashboard 开通，脚本无权代劳（见 `wrangler.jsonc` 里的说明）。
 */
export function applyResourceBindings(source: string, bindings: ResourceBindings): string {
  let result = source
  result = setJsoncValue(result, ['d1_databases', 0, 'database_name'], bindings.dbName)
  result = setJsoncValue(result, ['d1_databases', 0, 'database_id'], bindings.dbId)
  result = setJsoncValue(result, ['kv_namespaces', 0, 'id'], bindings.kvId)
  return result
}
