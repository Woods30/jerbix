/**
 * 品牌替换表：**声明式**，init 唯一需要随模板演进维护的地方。
 *
 * 不用全仓正则，是因为「不是每个 `Jerbix` 都该换」：
 * - 演示组件里的「改之前」状态必须保留模板原品牌，否则对照就没了；
 * - 吉祥物描述默认沿用 Jerbix 素材，换了名字但没换图反而更别扭；
 * - 源码里的配置值（`website.ts` 的 `name`）走配置项改写，不是字符串替换。
 *
 * 反向清单 `BRAND_INVENTORY` 把这些判断写下来，并由单测盯着：新增一处品牌字面量
 * 却没登记，测试就红。
 */

const OLD_BRAND = 'Jerbix'

/** 消息键的处理方式。 */
export type MessageRule =
  /** 消息里的品牌名换成新品牌。 */
  | 'brand'
  /** 占位串（`你的品牌` / `Your brand`）填成新品牌。 */
  | 'placeholder'
  /** 刻意不换。 */
  | 'keep'

/** 每个消息键怎么处理。未登记且含品牌名的键会被反向清单测试拦下。 */
export const MESSAGE_RULES: Record<string, MessageRule> = {
  about_hero_title: 'brand',
  about_page_description: 'brand',
  blog_page_description: 'brand',
  changelog_page_description: 'brand',
  features_page_description: 'brand',
  home_cta_primary: 'brand',
  home_demo_brand: 'placeholder',
  home_faq_q1: 'brand',
  home_hero_eyebrow: 'brand',
  home_journey_build_title: 'brand',
  // 默认沿用 Jerbix 的吉祥物素材，描述里保留原品牌才与图一致。
  home_mascot_alt: 'keep',
  home_page_description: 'brand',
  home_page_title: 'brand',
  home_pricing_description: 'brand',
  home_source_description: 'brand',
  home_story_makers: 'brand',
  home_visual_foundation: 'brand',
  roadmap_page_description: 'brand',
  site_description: 'brand',
  site_name: 'brand',
}

/** 占位串：每个 locale 里「你的品牌」的写法。 */
export const PLACEHOLDER_TEXT: Record<string, string> = {
  zh: '你的品牌',
  en: 'Your brand',
}

/** 源码里品牌字面量的处理方式。 */
export type SourceHandling =
  /** 由变更计划按配置项改写，不走字符串替换。 */
  | 'plan'
  /** 刻意保留。 */
  | 'keep'

export interface BrandInventoryEntry {
  file: string
  handling: SourceHandling
  reason: string
}

/** 反向清单：源码里每处品牌字面量归谁管。 */
export const BRAND_INVENTORY: BrandInventoryEntry[] = [
  {
    file: 'src/config/website.ts',
    handling: 'plan',
    reason: '站名是配置项，由 plan.ts 的 replaceConfigLiteral 改写',
  },
  {
    file: 'src/config/products.ts',
    handling: 'plan',
    reason: '首页售卖的一次性商品由 init 的 --one-time-product 生成',
  },
  {
    file: 'src/config/llms.ts',
    handling: 'keep',
    reason: 'llms.txt 的品牌文案随文档一起通用化，不在 init 范围内',
  },
  {
    file: 'src/components/layout/BrandLogo.tsx',
    handling: 'keep',
    reason: '注释里提到默认品牌，说明性文字',
  },
  {
    file: 'src/components/marketing/SourceProductDemo.tsx',
    handling: 'keep',
    reason: '演示里「改之前」的品牌，必须保持模板原样才有对照意义',
  },
]

/**
 * 改写消息文件。
 *
 * 按 JSON 解析后改值再写回：消息文件是扁平字符串表，按文本替换容易误伤
 * 键名或相邻条目。
 */
export function replaceBrandInMessages(
  source: string,
  options: { brand: string; locale: string },
): string {
  const messages = JSON.parse(source) as Record<string, string>
  const placeholder = PLACEHOLDER_TEXT[options.locale]

  for (const [key, rule] of Object.entries(MESSAGE_RULES)) {
    const value = messages[key]
    if (value === undefined) continue
    if (rule === 'brand') messages[key] = value.split(OLD_BRAND).join(options.brand)
    if (rule === 'placeholder' && placeholder) {
      messages[key] = value.split(placeholder).join(options.brand)
    }
  }

  return `${JSON.stringify(messages, null, 2)}\n`
}

/** 改写 PWA manifest 的站点名。 */
export function replaceBrandInManifest(source: string, brand: string): string {
  const manifest = JSON.parse(source) as Record<string, unknown>
  manifest.name = brand
  manifest.short_name = brand
  return `${JSON.stringify(manifest, null, 2)}\n`
}
