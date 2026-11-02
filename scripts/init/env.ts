/**
 * init 生成 `.env` 的规则。
 *
 * 关键约束：**只填空，不覆盖**。开发者可能已经手填了真实凭据，重跑一次 init
 * 把 `BETTER_AUTH_SECRET` 换掉会让所有已登录会话失效，把 `MAIL_FROM` 换掉会让
 * 发信域名对不上。
 */

import { getEnvValue } from '../lib/env-merge'
import type { InitConfig } from './plan'

/** 本地开发地址：`.env` 只服务本地，生产值放 `.env.production`。 */
const LOCAL_BASE_URL = 'http://localhost:3000'

export interface InitEnvContext {
  /** 是否启用邮件模块（决定要不要写发件地址）。 */
  mailEnabled: boolean
  /** 本次生成的 auth secret；已有值时不使用。 */
  authSecret: string
}

/** init 想写进 `.env` 的目标值。 */
export function initEnvValues(config: InitConfig, context: InitEnvContext): Record<string, string> {
  const values: Record<string, string> = {
    BETTER_AUTH_SECRET: context.authSecret,
    VITE_BASE_URL: LOCAL_BASE_URL,
    BETTER_AUTH_URL: LOCAL_BASE_URL,
  }
  if (context.mailEnabled) values.MAIL_FROM = `noreply@${config.domain}`
  return values
}

/**
 * 从目标值里挑出**当前为空或缺失**的那些。
 *
 * 返回的只包含要改的 key；`updateEnv` 会把不在这里出现的键原样留着。
 */
export function buildInitEnvUpdates(input: {
  current: string
  desired: Record<string, string>
}): Record<string, string> {
  const updates: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.desired)) {
    if (!getEnvValue(input.current, key)) updates[key] = value
  }
  return updates
}
