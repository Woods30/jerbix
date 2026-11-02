import { websiteConfig } from '@/config/website'
import { cn } from '@/lib/utils'
import markSvg from './brand/jerbix-icon.svg?raw'

/**
 * 品牌 Logo：**图形标记 + 动态站名**。
 *
 * 两部分刻意分开：
 * - 图形标记是静态资产（默认是 Jerbix 的吉祥物），内联 SVG 而非 `<img>`——
 *   CSS 变量穿不过 `<img>` 的文档边界，用 `<img src>` 的话主题切换对 Logo 完全无效。
 * - 站名是**文本**，取自 `websiteConfig.metadata.name`。字标若烘焙进 SVG 的矢量
 *   路径，改配置也改不动它，换了项目名页头上还是旧品牌。
 *
 * 尺寸由外层 `className` 给的是**字号**（如 `text-xl`），标记与文字都按 em 派生，
 * 名字长短不影响整体比例。
 */
export function BrandLogo({ className }: { className?: string }) {
  const { name, logoAccent } = websiteConfig.metadata
  // 双色字标：末尾的强调段单独上色，其余用墨色。
  const accentAt = logoAccent && name.endsWith(logoAccent) ? name.length - logoAccent.length : -1
  const lead = accentAt > 0 ? name.slice(0, accentAt) : name
  const accent = accentAt > 0 ? name.slice(accentAt) : ''

  return (
    <span className={cn('inline-flex items-center gap-[0.2em] leading-none', className)}>
      <span
        className="inline-block h-[1.1em] w-[1.45em] shrink-0"
        style={{ lineHeight: 0 }}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: 静态品牌资产，非用户输入
        dangerouslySetInnerHTML={{ __html: prepareSvg(markSvg) }}
      />
      <span className="font-display font-bold tracking-tight text-(--jbx-text)">
        {lead}
        {accent ? <span className="text-(--jbx-accent)">{accent}</span> : null}
      </span>
    </span>
  )
}

/**
 * 处理打包进来的 SVG：剥离自带 `<style>`（其 `:root` 默认值会污染站点 token），
 * 把 class 改写为等价的 `fill` / `stroke` 属性，并让尺寸跟随外层容器。
 *
 * 同时抹掉资产自带的 `aria-label`：站名由旁边的文字承担，SVG 只是图形。
 */
function prepareSvg(source: string): string {
  const withoutStyle = source.replace(/<style>[\s\S]*?<\/style>/, '')

  const classToAttrs: Record<string, string> = {
    'jbx-text': 'fill="var(--jbx-text, currentColor)"',
    'jbx-mascot': 'fill="var(--jbx-mascot, currentColor)"',
    'jbx-accent': 'fill="var(--jbx-accent, currentColor)"',
    'jbx-shadow': 'fill="var(--jbx-shadow, transparent)"',
    'jbx-code':
      'fill="none" stroke="var(--jbx-code, currentColor)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"',
  }

  return withoutStyle
    .replace(/class="([^"]+)"/g, (match, classes: string) => {
      const attrs = classes
        .split(/\s+/)
        .map((name) => classToAttrs[name])
        .filter(Boolean)
        .join(' ')
      return attrs || match
    })
    .replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
      const cleaned = attrs.replace(/\s*role="[^"]*"/, '').replace(/\s*aria-label="[^"]*"/, '')
      return `<svg${cleaned} width="100%" height="100%" aria-hidden="true" role="presentation" focusable="false">`
    })
}
