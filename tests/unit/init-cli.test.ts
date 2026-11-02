import { describe, expect, it } from 'vitest'
import { parseArgs } from '../../scripts/init/index'
import { deriveSlug, resolveConfig } from '../../scripts/init/plan'

/**
 * init 的命令行入口：参数解析与默认值推导。
 *
 * 目标是「一路回车也能得到合理结果」，所以每个字段都必须有可推导的默认值；
 * `--non-interactive` 只是把这些默认值原样用掉，供脚本与端到端测试使用。
 */

describe('parseArgs', () => {
  it('解析全部命名参数', () => {
    const parsed = parseArgs([
      '--name',
      'Acme',
      '--slug',
      'acme',
      '--domain',
      'acme.dev',
      '--email',
      'hi@acme.dev',
      '--modules',
      'docs,blog',
    ])

    expect(parsed).toEqual({
      name: 'Acme',
      slug: 'acme',
      domain: 'acme.dev',
      email: 'hi@acme.dev',
      modules: ['docs', 'blog'],
      nonInteractive: false,
      dryRun: false,
    })
  })

  it('识别开关', () => {
    const parsed = parseArgs(['--non-interactive', '--dry-run'])

    expect(parsed.nonInteractive).toBe(true)
    expect(parsed.dryRun).toBe(true)
  })

  it('modules 留空即全关', () => {
    expect(parseArgs(['--modules', '']).modules).toEqual([])
  })

  it('未知模块名抛错，避免拼错后静默不生效', () => {
    expect(() => parseArgs(['--modules', 'docs,nope'])).toThrow(/nope/)
  })

  it('未知参数抛错，避免拼错后静默忽略', () => {
    expect(() => parseArgs(['--nmae', 'Acme'])).toThrow(/nmae/)
  })

  it('缺值的参数抛错', () => {
    expect(() => parseArgs(['--name'])).toThrow(/--name/)
  })
})

describe('deriveSlug', () => {
  it('转小写并把空白换成连字符', () => {
    expect(deriveSlug('Acme Corp')).toBe('acme-corp')
  })

  it('去掉首尾连字符并压缩连续连字符', () => {
    expect(deriveSlug('  --Acme   Labs-- ')).toBe('acme-labs')
  })

  it('保留数字', () => {
    expect(deriveSlug('Acme 2')).toBe('acme-2')
  })

  it('非 ASCII 名推不出合法短名时抛错', () => {
    expect(() => deriveSlug('你的品牌')).toThrow(/slug/)
  })
})

describe('resolveConfig', () => {
  it('缺省值：站名取目录名，域名与邮箱随之推导', () => {
    const config = resolveConfig({}, '/tmp/acme-app')

    expect(config.name).toBe('acme-app')
    expect(config.slug).toBe('acme-app')
    expect(config.domain).toBe('acme-app.example.com')
    expect(config.email).toBe('support@acme-app.example.com')
  })

  it('显式参数优先于推导', () => {
    const config = resolveConfig(
      { name: 'Acme', slug: 'acme', domain: 'acme.dev', email: 'hi@acme.dev' },
      '/tmp/whatever',
    )

    expect(config).toMatchObject({
      name: 'Acme',
      slug: 'acme',
      domain: 'acme.dev',
      email: 'hi@acme.dev',
    })
  })

  it('给了域名没给邮箱时，邮箱跟随域名', () => {
    const config = resolveConfig({ name: 'Acme', domain: 'acme.dev' }, '/tmp/x')

    expect(config.email).toBe('support@acme.dev')
  })

  it('模块缺省为空（全关）', () => {
    expect(resolveConfig({ name: 'Acme' }, '/tmp/x').modules).toEqual([])
  })
})
