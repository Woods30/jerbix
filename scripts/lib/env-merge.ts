/**
 * `.env` 的合并写入。
 *
 * 契约：**只动被点名的 key**，注释、空行与未托管的键值原样保留。
 * `.env` 里存着「这个变量放什么、为什么不放」的说明，整体覆盖会把这些说明一起抹掉 ——
 * 而丢掉一条「生产必须改成实际域名」的注释，代价是几个月后一个指向 localhost 的线上站。
 */

/** 一行 `KEY=value`：key 必须是合法环境变量名，值可含 `=`（base64 结尾常见）。 */
const ENV_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/

/** 值里出现这些字符时必须加引号，否则 dotenv 会在空格处截断、把 `#` 当注释起点。 */
const NEEDS_QUOTING = /[\s#"']/

/**
 * 读取一个环境变量的值。
 *
 * 同名 key 出现多次时**最后一个生效**，与 dotenv 的解析顺序一致。
 */
export function getEnvValue(content: string, key: string): string | undefined {
  let value: string | undefined
  for (const line of content.split('\n')) {
    const match = line.match(ENV_LINE)
    if (match?.[1] === key) value = match[2]
  }
  return value
}

/**
 * 把若干 key 合并进 `.env` 内容。
 *
 * - 已存在的 key：**就地替换值**，同一 key 出现多次时全部替换（不留旧值，避免过期
 *   secret 残留在文件里）。
 * - 不存在的 key：**追加到文件末尾**，不改动其它任何一行。
 * - 注释与空行原样保留。
 *
 * 幂等：同一份 `updates` 重复应用，结果一致。
 */
export function updateEnv(content: string, updates: Record<string, string>): string {
  const entries = Object.entries(updates)
  if (entries.length === 0) return content

  const seen = new Set<string>()
  const lines = content.split('\n').map((line) => {
    const match = line.match(ENV_LINE)
    const key = match?.[1]
    if (key === undefined || !Object.hasOwn(updates, key)) return line
    seen.add(key)
    return `${key}=${formatValue(updates[key] ?? '')}`
  })

  const missing = entries.filter(([key]) => !seen.has(key))
  if (missing.length === 0) return lines.join('\n')

  const body = lines.join('\n')
  const parts: string[] = []
  // 正文非空时保留它，并以换行收尾；空文件则直接写缺失的 key。
  if (body.trim() !== '') parts.push(body.endsWith('\n') ? body : `${body}\n`)
  parts.push(missing.map(([key, value]) => `${key}=${formatValue(value)}`).join('\n'))
  return `${parts.join('\n')}\n`
}

/** 按需给值加引号；引号与反斜杠按 dotenv 规则转义。 */
function formatValue(value: string): string {
  if (!NEEDS_QUOTING.test(value)) return value
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}"`
}
