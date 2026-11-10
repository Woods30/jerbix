import { describe, expect, it } from 'vitest'
import {
  formatLocalDate,
  formatLocalDateTime,
  formatUtcDate,
  formatUtcDateTime,
  toDateValue,
} from '@/lib/datetime'

/**
 * 日期渲染的时区契约。
 *
 * 服务端（Cloudflare Workers / wrangler）固定 UTC，浏览器用本地时区。两端直接
 * `toLocaleDateString()` 会产出不同文本（跨午夜差一天），React 水合失败后整树
 * 重新生成，页面短暂不可交互。
 *
 * 契约：**后端统一 UTC，前端渲染才用本地时区**。SSR 与客户端首帧都渲染 UTC
 * 基准值，挂载后再切到浏览器本地时区。
 */

const UTC_MIDNIGHT = Date.UTC(2026, 10, 10, 0, 0, 0)
/** UTC 22:30 —— 在 UTC+8 是次日 06:30，跨午夜。 */
const UTC_LATE = Date.UTC(2026, 10, 10, 22, 30, 0)

/** 在指定时区下运行断言；结束后恢复原时区。 */
function withTimeZone(timeZone: string, run: () => void) {
  const original = process.env.TZ
  process.env.TZ = timeZone
  try {
    run()
  } finally {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
}

describe('toDateValue', () => {
  it('接受 Date、Unix 毫秒与 ISO 字符串', () => {
    const iso = '2026-11-10T00:00:00.000Z'
    expect(toDateValue(new Date(UTC_MIDNIGHT))?.getTime()).toBe(UTC_MIDNIGHT)
    expect(toDateValue(UTC_MIDNIGHT)?.getTime()).toBe(UTC_MIDNIGHT)
    expect(toDateValue(iso)?.getTime()).toBe(UTC_MIDNIGHT)
  })

  it('空值与非法值返回 null，不产生 Invalid Date', () => {
    expect(toDateValue(null)).toBeNull()
    expect(toDateValue(undefined)).toBeNull()
    expect(toDateValue('')).toBeNull()
    expect(toDateValue('not-a-date')).toBeNull()
    expect(toDateValue(Number.NaN)).toBeNull()
  })
})

describe('formatUtcDate', () => {
  it('按 UTC 输出日期', () => {
    expect(formatUtcDate(UTC_LATE, 'zh')).toBe('2026/11/10')
    expect(formatUtcDate(UTC_LATE, 'en')).toBe('11/10/2026')
  })

  it('与运行时时区无关', () => {
    withTimeZone('America/New_York', () => {
      // UTC 午夜在纽约是前一天傍晚，锁定 UTC 才能保住「作者写下的那一天」。
      expect(formatUtcDate(UTC_MIDNIGHT, 'zh')).toBe('2026/11/10')
    })
    withTimeZone('Asia/Shanghai', () => {
      expect(formatUtcDate(UTC_MIDNIGHT, 'zh')).toBe('2026/11/10')
    })
  })

  it('空值与非法值返回空串', () => {
    expect(formatUtcDate(null, 'zh')).toBe('')
    expect(formatUtcDate(undefined, 'zh')).toBe('')
    expect(formatUtcDate('not-a-date', 'zh')).toBe('')
  })
})

describe('formatUtcDateTime', () => {
  it('按 UTC 输出日期与时间（到分钟）', () => {
    expect(formatUtcDateTime(UTC_LATE, 'zh')).toBe('2026/11/10 22:30')
    expect(formatUtcDateTime(UTC_LATE, 'en')).toBe('11/10/2026, 10:30 PM')
  })

  it('与运行时时区无关', () => {
    withTimeZone('Asia/Shanghai', () => {
      expect(formatUtcDateTime(UTC_LATE, 'zh')).toBe('2026/11/10 22:30')
    })
  })
})

describe('formatLocalDate', () => {
  it('用运行时本地时区输出日期', () => {
    // 本地时区由运行环境决定：断言「与 Date 的本地表示一致」而不是硬编码日期。
    const expected = new Date(UTC_LATE).toLocaleDateString('zh')
    expect(formatLocalDate(UTC_LATE, 'zh')).toBe(expected)
  })

  it('在非 UTC 时区下与 UTC 基准不同', () => {
    withTimeZone('America/New_York', () => {
      expect(formatUtcDate(UTC_MIDNIGHT, 'zh')).toBe('2026/11/10')
      expect(formatLocalDate(UTC_MIDNIGHT, 'zh')).toBe('2026/11/9')
    })
  })

  it('空值与非法值返回空串', () => {
    expect(formatLocalDate(null, 'zh')).toBe('')
    expect(formatLocalDate('not-a-date', 'zh')).toBe('')
  })
})

describe('formatLocalDateTime', () => {
  it('用运行时本地时区输出日期与时间', () => {
    const expected = new Intl.DateTimeFormat('zh', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(UTC_LATE))
    expect(formatLocalDateTime(UTC_LATE, 'zh')).toBe(expected)
  })
})
