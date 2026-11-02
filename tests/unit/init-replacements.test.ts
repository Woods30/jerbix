import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BRAND_INVENTORY,
  MESSAGE_RULES,
  replaceBrandInManifest,
  replaceBrandInMessages,
} from '../../scripts/init/replacements'

/**
 * 替换表 + **反向清单**。
 *
 * 替换表是 init 里唯一需要随模板演进维护的地方，因此它必须可被测试盯住：
 * 新增一处品牌字面量却没登记，这里就红。
 *
 * 三类条目缺一不可：
 * - `brand`：消息里的品牌名换成新品牌；
 * - `keep`：**不该换**的位置（演示里「改之前」的旧品牌、吉祥物描述）；
 * - `placeholder`：占位串填成新品牌（`你的品牌` / `Your brand`）。
 */

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const LOCALES = ['zh', 'en'] as const
const OLD_BRAND = 'Jerbix'

function readMessages(locale: string): Record<string, string> {
  return JSON.parse(readFileSync(join(repoRoot, `messages/${locale}.json`), 'utf-8'))
}

/** 生成目录：由 locale:compile 产出，不是手写源码。 */
const GENERATED_DIRS = ['locale/paraglide/']

/** 仓库里所有手写 `.ts` / `.tsx` 源文件的相对路径与内容。 */
function sourceFiles(): Array<{ path: string; content: string }> {
  return readdirSync(join(repoRoot, 'src'), { recursive: true, encoding: 'utf-8' })
    .filter((name) => /\.(ts|tsx)$/.test(name))
    .filter((name) => !GENERATED_DIRS.some((dir) => name.startsWith(dir)))
    .map((name) => ({
      path: `src/${name}`,
      content: readFileSync(join(repoRoot, 'src', name), 'utf-8'),
    }))
}

describe('反向清单', () => {
  it('消息里出现的每个品牌字面量都登记过', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(readMessages(locale))) {
        if (!value.includes(OLD_BRAND)) continue
        expect(
          MESSAGE_RULES[key],
          `messages/${locale}.json 的 ${key} 含品牌名但没有登记处理方式`,
        ).toBeDefined()
      }
    }
  })

  it('源码里出现的每个品牌字面量都登记过', () => {
    const registered = new Set(BRAND_INVENTORY.map((entry) => entry.file))

    for (const file of sourceFiles()) {
      if (!file.content.includes(OLD_BRAND)) continue
      expect(registered.has(file.path), `${file.path} 含品牌名但没有登记处理方式`).toBe(true)
    }
  })

  it('清单里登记的文件确实还存在', () => {
    for (const entry of BRAND_INVENTORY) {
      expect(
        () => readFileSync(join(repoRoot, entry.file), 'utf-8'),
        `${entry.file} 已不存在，请更新清单`,
      ).not.toThrow()
    }
  })
})

describe('replaceBrandInMessages', () => {
  it('品牌类消息键换成新品牌', () => {
    const result = replaceBrandInMessages(JSON.stringify({ site_name: 'Jerbix' }), {
      brand: 'Acme',
      locale: 'zh',
    })

    expect(JSON.parse(result).site_name).toBe('Acme')
  })

  it('keep 类消息键保持原样', () => {
    const source = JSON.stringify({ home_mascot_alt: '向前跃起的 Jerbix 跳鼠吉祥物' })

    const result = replaceBrandInMessages(source, { brand: 'Acme', locale: 'zh' })

    expect(JSON.parse(result).home_mascot_alt).toBe('向前跃起的 Jerbix 跳鼠吉祥物')
  })

  it('占位串填成新品牌', () => {
    const result = replaceBrandInMessages(JSON.stringify({ home_demo_brand: '你的品牌' }), {
      brand: 'Acme',
      locale: 'zh',
    })

    expect(JSON.parse(result).home_demo_brand).toBe('Acme')
  })

  it('英文占位串单独处理', () => {
    const result = replaceBrandInMessages(JSON.stringify({ home_demo_brand: 'Your brand' }), {
      brand: 'Acme',
      locale: 'en',
    })

    expect(JSON.parse(result).home_demo_brand).toBe('Acme')
  })

  it('保持 JSON 的键序与缩进风格', () => {
    const source = readFileSync(join(repoRoot, 'messages/zh.json'), 'utf-8')
    const result = replaceBrandInMessages(source, { brand: 'Acme', locale: 'zh' })

    expect(result.split('\n')[0]).toBe('{')
    expect(result.endsWith('\n')).toBe(true)
    expect(Object.keys(JSON.parse(result))).toEqual(Object.keys(JSON.parse(source)))
  })

  it('幂等：换过之后再跑一次结果不变', () => {
    const once = replaceBrandInMessages(JSON.stringify({ site_name: 'Jerbix' }), {
      brand: 'Acme',
      locale: 'zh',
    })

    const twice = replaceBrandInMessages(once, { brand: 'Acme', locale: 'zh' })

    expect(twice).toBe(once)
  })

  it('未登记的键原样保留', () => {
    const result = replaceBrandInMessages(JSON.stringify({ unrelated: 'keep me' }), {
      brand: 'Acme',
      locale: 'zh',
    })

    expect(JSON.parse(result).unrelated).toBe('keep me')
  })
})

describe('replaceBrandInManifest', () => {
  it('改 name 与 short_name', () => {
    const source = JSON.stringify({ name: 'Jerbix', short_name: 'Jerbix', start_url: '/' })

    const result = JSON.parse(replaceBrandInManifest(source, 'Acme'))

    expect(result).toEqual({ name: 'Acme', short_name: 'Acme', start_url: '/' })
  })
})
