import { describe, expect, it } from 'vitest'
import { buildInitEnvUpdates, initEnvValues } from '../../scripts/init/env'

/**
 * init 生成 `.env` 的规则。
 *
 * 关键约束：**只填空，不覆盖**。开发者可能已经手填了真实凭据，重跑一次 init
 * 把 `BETTER_AUTH_SECRET` 换掉会让所有已登录会话失效，把 `MAIL_FROM` 换掉会让
 * 发信域名对不上。
 */

const CURRENT = `# 开发用环境变量
VITE_BASE_URL=http://localhost:3000
BETTER_AUTH_SECRET=hand-written
MAIL_FROM=already@set.test
`

const CONFIG = {
  name: 'Acme',
  slug: 'acme',
  domain: 'acme.dev',
  email: 'support@acme.dev',
  modules: [],
}

describe('initEnvValues', () => {
  it('生成 auth secret、站点地址与发件地址', () => {
    const values = initEnvValues(CONFIG, { mailEnabled: true, authSecret: 'generated' })

    expect(values.BETTER_AUTH_SECRET).toBe('generated')
    expect(values.VITE_BASE_URL).toBe('http://localhost:3000')
    expect(values.BETTER_AUTH_URL).toBe('http://localhost:3000')
    expect(values.MAIL_FROM).toBe('noreply@acme.dev')
  })

  it('邮件模块关闭时不写发件地址', () => {
    const values = initEnvValues(CONFIG, { mailEnabled: false, authSecret: 'generated' })

    expect(values.MAIL_FROM).toBeUndefined()
  })
})

describe('buildInitEnvUpdates', () => {
  it('已有值的 key 不动', () => {
    const updates = buildInitEnvUpdates({
      current: CURRENT,
      desired: initEnvValues(CONFIG, { mailEnabled: true, authSecret: 'generated' }),
    })

    expect(updates.BETTER_AUTH_SECRET).toBeUndefined()
    expect(updates.MAIL_FROM).toBeUndefined()
    expect(updates.VITE_BASE_URL).toBeUndefined()
  })

  it('空值与缺失的 key 才写入', () => {
    const updates = buildInitEnvUpdates({
      current: 'BETTER_AUTH_SECRET=\nVITE_BASE_URL=\n',
      desired: initEnvValues(CONFIG, { mailEnabled: true, authSecret: 'generated' }),
    })

    expect(updates.BETTER_AUTH_SECRET).toBe('generated')
    expect(updates.VITE_BASE_URL).toBe('http://localhost:3000')
    expect(updates.BETTER_AUTH_URL).toBe('http://localhost:3000')
    expect(updates.MAIL_FROM).toBe('noreply@acme.dev')
  })

  it('空文件时全部写入', () => {
    const updates = buildInitEnvUpdates({
      current: '',
      desired: initEnvValues(CONFIG, { mailEnabled: true, authSecret: 'generated' }),
    })

    expect(Object.keys(updates).sort()).toEqual([
      'BETTER_AUTH_SECRET',
      'BETTER_AUTH_URL',
      'MAIL_FROM',
      'VITE_BASE_URL',
    ])
  })
})
