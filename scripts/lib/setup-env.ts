/**
 * setup 往 `.env` 里写什么。
 *
 * 契约：**只写本次确实要写的 key**，且不覆盖手填好的值。
 * `BETTER_AUTH_SECRET` 被重新生成会让所有已登录会话失效 —— 重跑一次 setup
 * 不该把人踢下线。
 */

import { getEnvValue } from './env-merge'

export interface SetupEnvInput {
  /** 现有 `.env` 的原始内容；`.env` 不存在时传 `.env.example` 的内容。 */
  current: string
  /** 本次绑定到的 D1 ID。 */
  dbId: string
  /** 本次生成的 auth secret。 */
  authSecret: string
  /** 交互收集到的可选配置；未提供的 key 不写入。 */
  optional: Record<string, string>
}

/**
 * 汇总本次要写进 `.env` 的变量。
 *
 * 返回的只包含**要改的** key：`updateEnv` 会把不在这里出现的键原样留着，
 * 手填的 Stripe / Resend 凭据因此不会丢。
 */
export function buildEnvUpdates(input: SetupEnvInput): Record<string, string> {
  const updates: Record<string, string> = {
    CLOUDFLARE_DATABASE_ID: input.dbId,
  }

  // 已有非空的 secret 就不动：重新生成等于让所有已登录会话失效。
  const existingSecret = getEnvValue(input.current, 'BETTER_AUTH_SECRET')
  if (!existingSecret) updates.BETTER_AUTH_SECRET = input.authSecret

  for (const [key, value] of Object.entries(input.optional)) {
    updates[key] = value
  }

  return updates
}
