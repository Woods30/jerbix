import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalDate, LocalDateTime } from '@/components/local-date'

/**
 * `<LocalDate>` / `<LocalDateTime>` 的水合契约。
 *
 * 服务端（Cloudflare Workers 运行时）固定 UTC，浏览器用用户本地时区。两端渲染
 * 同一份 HTML 会在跨午夜差一天时触发 React 水合失败——整棵树重新生成，页面短暂
 * 不可交互，E2E 里表现为「点击被吞」。
 *
 * 契约：SSR 与水合首帧都渲染 UTC 基准值，挂载后再切到浏览器本地时区。
 */

const UTC_LATE = Date.UTC(2026, 10, 10, 22, 30, 0)

/** 固定运行时时区，让断言与执行环境无关。 */
async function withTimeZone(timeZone: string, run: () => void | Promise<void>) {
  const original = process.env.TZ
  process.env.TZ = timeZone
  try {
    await run()
  } finally {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LocalDate', () => {
  it('SSR 输出 UTC 基准日期', () => {
    const html = renderToString(<LocalDate value={UTC_LATE} locale="zh" />)
    expect(html).toContain('2026/11/10')
  })

  it('浏览器渲染输出本地时区日期', async () => {
    await withTimeZone('Asia/Shanghai', () => {
      render(<LocalDate value={UTC_LATE} locale="zh" />)
      // UTC 22:30 在 UTC+8 是次日 06:30。
      expect(screen.getByText('2026/11/11')).toBeTruthy()
    })
  })

  it('本地时区在 UTC 时与基准值一致', async () => {
    await withTimeZone('UTC', () => {
      render(<LocalDate value={UTC_LATE} locale="zh" />)
      expect(screen.getByText('2026/11/10')).toBeTruthy()
    })
  })

  it('空值显示占位符', () => {
    render(<LocalDate value={null} locale="zh" />)
    expect(screen.getByText('—')).toBeTruthy()
  })
})

describe('LocalDateTime', () => {
  it('SSR 输出 UTC 基准日期与时间', () => {
    const html = renderToString(<LocalDateTime value={UTC_LATE} locale="zh" />)
    expect(html).toContain('2026/11/10 22:30')
  })

  it('浏览器渲染输出本地时区日期与时间', async () => {
    await withTimeZone('Asia/Shanghai', () => {
      render(<LocalDateTime value={UTC_LATE} locale="zh" />)
      expect(screen.getByText('2026/11/11 06:30')).toBeTruthy()
    })
  })
})

describe('水合', () => {
  it('用 SSR HTML 水合时不报错，且挂载后切到本地时区', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const errors: unknown[][] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args)
    })

    await withTimeZone('Asia/Shanghai', async () => {
      const element = <LocalDateTime value={UTC_LATE} locale="zh" />
      const container = document.createElement('div')
      container.innerHTML = renderToString(element)
      document.body.appendChild(container)
      // 服务端给的是 UTC 基准值。
      expect(container.textContent).toBe('2026/11/10 22:30')

      await act(async () => {
        hydrateRoot(container, element)
      })

      // 没有水合失败告警，且挂载后已切到本地时区。
      expect(errors).toEqual([])
      expect(container.textContent).toBe('2026/11/11 06:30')
      container.remove()
    })
  })
})
