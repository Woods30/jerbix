---
title: 分析
description: 统计脚本的启用、CSP 放行与业务事件
locale: zh
order: 21
group: analytics
updated: 2026-11-03
---

分析模块在生产构建里注入统计脚本并上报页面浏览与业务事件。可以同时开多个 provider，
每个 provider 各自上报，互不影响。

## 步骤

1. **选 provider。** 在 `src/config/website.ts`：

   ```ts
   analytics: { enabled: true, providers: ['ga', 'plausible'] },
   ```

   `providers` 是数组，可以同时列多个。

2. **填环境变量。** 这些都是 `VITE_` 公开变量，会进客户端 bundle：

   | provider | 环境变量 | 说明 |
   |---|---|---|
   | `ga` | `VITE_GA_ID` | Google Analytics 的 Measurement ID（`G-…`） |
   | `plausible` | `VITE_PLAUSIBLE_DOMAIN` | 站点域名 |
   | `umami` | `VITE_UMAMI_WEBSITE_ID` + `VITE_UMAMI_SCRIPT_URL` | 脚本地址必须是无凭据的 HTTPS URL；`VITE_UMAMI_ID` 是旧写法的兼容字段 |
   | `clarity` | `VITE_CLARITY_PROJECT_ID` | `VITE_CLARITY_ID` 是旧写法的兼容字段 |

   选中但缺 ID 的 provider 不会注册，也不会注入脚本。

3. **部署。** `VITE_` 变量在 `vite build` 时内联进 bundle，改了必须**重新构建并部署**才生效。
   用 Release 自动部署时在 GitHub **Settings → Environments → production** 配同名 Variable。

## CSP 放行

统计脚本是运行时插入的外部 `<script>`，CSP 的 nonce 覆盖不到它们，所以 `script-src` 必须显式
放行对应域名（`src/lib/security.ts`）：

| provider | 放行的 `script-src` |
|---|---|
| `ga` | `https://www.googletagmanager.com` |
| `plausible` | `https://plausible.io` |
| `clarity` | `https://www.clarity.ms` |
| `umami` | `VITE_UMAMI_SCRIPT_URL` 的 origin（自托管，逐请求推导） |

数据上报走 `connect-src`，其中已包含 GA4 的 `*.google-analytics.com` 与
`*.analytics.google.com`——少了这两条，脚本能加载但事件收不到。

## 业务事件

事件名集中声明在 `src/lib/analytics/events.ts`，是分析平台的数据结构契约，调用处不写字面量。

| 事件 | 含义 | 状态 |
|---|---|---|
| `sign_up` | 注册成功 | 已在注册流程上报 |
| `login` | 登录成功 | 已在登录流程上报 |
| `begin_checkout` | 用户点了购买、开始结账 | 有上报函数 `trackBeginCheckout()`，尚未接入调用点 |
| `purchase` | 托管结账完成、访客回到本站 | 有上报函数 `trackPurchase()`，尚未接入调用点 |

`begin_checkout` 与 `purchase` 需要你在自己的结账入口与支付成功回调处调用对应的上报函数。
事件参数只放非 PII 值（商品 ID、金额、币种、模式）；邮箱与姓名不进参数——分析数据落在第三方，
带 PII 会同时违反 GDPR 与平台服务条款。

## 验证

统计只在**浏览器 + 生产构建 + `analytics.enabled`** 三者同时成立时初始化，开发环境一律不上报
（避免污染真实数据）。要本地验证注入链路，跑生产产物：

```bash
pnpm build && pnpm preview
```

打开页面后在浏览器 Network 面板确认对应统计域名的请求发出即可。

## 注意事项

- 页面浏览由 `AnalyticsProvider` 在首屏与路由切换时各上报一次。
- CSP 里没有 `unsafe-inline` / `unsafe-eval`，nonce 是内联脚本的唯一放行路径。

配好后可以接着看 [支付总览](./payment)——`begin_checkout` 与 `purchase` 的参数来自结账链路。
