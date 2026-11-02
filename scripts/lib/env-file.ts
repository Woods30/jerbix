/**
 * `.env` 读取与合并的共享实现，供 `scripts/check-env*.ts` 复用，保证三个脚本规则一致。
 * 空串归一由 `src/env/normalize.ts` 处理，此处不重复实现。
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

const DEFAULT_DOTENV_PATH = '.env'

/**
 * 读出 `.env` 的**原文**；不存在时从 `.env.example` 复制一份。
 *
 * 保留原文而非解析成键值对，是为了不丢注释：`.env` 里写着「生产必须改成实际
 * 域名」这类说明，整体覆盖会把它们连同手填的凭据一起抹掉。
 */
export function prepareEnvFile(envPath = '.env', examplePath = '.env.example'): string {
  if (existsSync(envPath)) return readFileSync(envPath, 'utf-8')
  if (!existsSync(examplePath)) {
    throw new Error(`缺少 ${envPath} 与 ${examplePath}；请先创建 ${examplePath}`)
  }
  copyFileSync(examplePath, envPath)
  return readFileSync(envPath, 'utf-8')
}

/** 读取并解析 `.env`；文件不存在时抛 `ENOENT`，由调用方转成可操作的提示。 */
export function readDotEnvFile(path: string = DEFAULT_DOTENV_PATH): Record<string, string> {
  return parseEnv(readFileSync(path, 'utf-8')) as Record<string, string>
}

/**
 * 合并 `.env` 与进程环境变量，进程环境优先。
 * 只忽略 `ENOENT`（CI 只提供进程 env）；其它错误继续抛出，避免真实故障被静默吞掉。
 */
export function resolveRawEnv(
  path: string = DEFAULT_DOTENV_PATH,
): Record<string, string | undefined> {
  let fromFile: Record<string, string> = {}
  try {
    fromFile = readDotEnvFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return { ...fromFile, ...process.env }
}
