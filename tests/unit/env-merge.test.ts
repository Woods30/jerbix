import { describe, expect, it } from 'vitest'
import { getEnvValue, updateEnv } from '../../scripts/lib/env-merge'

/**
 * `.env` 的合并写入契约。
 *
 * 核心约束：只动被点名的 key，注释、空行与未托管的键值必须原样保留 ——
 * `.env` 里存着「这个变量该放什么、为什么不放」的注释，整体覆盖会把这些说明抹掉。
 */

const SAMPLE = `# 开发用环境变量：cp .env.example .env；按已启用模块补齐配置。

# Site
# 生产部署必须改为实际域名，否则 SEO / OG 全部指向 localhost。
VITE_BASE_URL=http://localhost:3000

# Payment（Stripe）
VITE_PAYMENT_PROVIDER=
STRIPE_SECRET_KEY=

# Auth
BETTER_AUTH_SECRET=
`

describe('updateEnv', () => {
  it('替换已存在的 key，且保留注释与空行', () => {
    const result = updateEnv(SAMPLE, { VITE_BASE_URL: 'https://acme.test' })

    expect(result).toContain('VITE_BASE_URL=https://acme.test')
    expect(result).toContain('# 开发用环境变量：cp .env.example .env；按已启用模块补齐配置。')
    expect(result).toContain('# 生产部署必须改为实际域名，否则 SEO / OG 全部指向 localhost。')
    expect(result).toContain('# Payment（Stripe）')
    expect(result).toContain('VITE_PAYMENT_PROVIDER=')
  })

  it('未托管的 key 原样保留', () => {
    const result = updateEnv(SAMPLE, { VITE_BASE_URL: 'https://acme.test' })

    expect(result).toContain('STRIPE_SECRET_KEY=')
    expect(result).toContain('BETTER_AUTH_SECRET=')
  })

  it('key 不存在时追加到文件末尾', () => {
    const result = updateEnv(SAMPLE, { MAIL_FROM: 'noreply@acme.test' })

    expect(result).toContain('MAIL_FROM=noreply@acme.test')
    expect(result.endsWith('MAIL_FROM=noreply@acme.test\n')).toBe(true)
  })

  it('多个 key 混合处理：存在的替换、缺失的追加', () => {
    const result = updateEnv(SAMPLE, {
      VITE_BASE_URL: 'https://acme.test',
      MAIL_FROM: 'noreply@acme.test',
    })

    expect(result).toContain('VITE_BASE_URL=https://acme.test')
    expect(result).toContain('MAIL_FROM=noreply@acme.test')
    expect(result.match(/VITE_BASE_URL=/g)).toHaveLength(1)
    expect(result.match(/MAIL_FROM=/g)).toHaveLength(1)
  })

  it('幂等：同一份 updates 重复应用结果一致', () => {
    const once = updateEnv(SAMPLE, { VITE_BASE_URL: 'https://acme.test', MAIL_FROM: 'a@b.test' })
    const twice = updateEnv(once, { VITE_BASE_URL: 'https://acme.test', MAIL_FROM: 'a@b.test' })

    expect(twice).toBe(once)
  })

  it('值含空格或 # 时加引号，避免被 dotenv 解析截断', () => {
    const result = updateEnv(SAMPLE, { NOTE: 'hello world # not a comment' })

    expect(result).toContain('NOTE="hello world # not a comment"')
  })

  it('值含双引号时转义', () => {
    const result = updateEnv(SAMPLE, { NOTE: 'say "hi"' })

    expect(result).toContain('NOTE="say \\"hi\\""')
  })

  it('重复出现的同名 key 全部替换，不留旧值', () => {
    const duplicated = 'FOO=old\nBAR=keep\nFOO=old2\n'

    const result = updateEnv(duplicated, { FOO: 'new' })

    expect(result).toBe('FOO=new\nBAR=keep\nFOO=new\n')
  })

  it('空文件只追加目标 key', () => {
    expect(updateEnv('', { FOO: 'bar' })).toBe('FOO=bar\n')
  })

  it('updates 为空时原样返回', () => {
    expect(updateEnv(SAMPLE, {})).toBe(SAMPLE)
  })

  it('key 名非法时抛错，不产出任何内容', () => {
    // key 里带换行会凭空多出一行环境变量，等于往 .env 里注入配置。
    expect(() => updateEnv(SAMPLE, { 'FOO\nBAR=baz': 'x' })).toThrow(/环境变量名/)
  })

  it('key 名非法时不改动原文件', () => {
    expect(() => updateEnv(SAMPLE, { 'FOO=1\nBAR': 'x' })).toThrow(/环境变量名/)
    // 抛错时不能已经把前半部分写进去了
    expect(updateEnv(SAMPLE, { FOO: 'ok' })).toContain('VITE_BASE_URL=http://localhost:3000')
  })

  it('值含换行时抛错，避免把一条变量拆成两条', () => {
    expect(() => updateEnv(SAMPLE, { FOO: 'a\nBAREVIL=1' })).toThrow(/换行/)
  })
})

describe('getEnvValue', () => {
  it('返回最后一个同名 key 的值', () => {
    expect(getEnvValue('FOO=a\nBAR=b\nFOO=c\n', 'FOO')).toBe('c')
  })

  it('key 不存在返回 undefined', () => {
    expect(getEnvValue('FOO=a\n', 'BAR')).toBeUndefined()
  })

  it('忽略注释里出现的 key', () => {
    expect(getEnvValue('# FOO=commented\nFOO=real\n', 'FOO')).toBe('real')
  })
})
