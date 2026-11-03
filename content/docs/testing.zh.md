---
title: 测试
description: 三层测试的分工、常用命令与新增 E2E 的判断标准
locale: zh
order: 25
group: develop
updated: 2026-11-03
---

**E2E 只守「用户能不能完成一件事」，细节交互交给组件测试。** 这页讲三层测试怎么分工，
以及新增用例前该先问什么。

## 三层分工

| 层 | 范围 | 位置 | 运行方式 |
|---|---|---|---|
| 单元 | 纯逻辑：模块门禁、主题解析、locale 归一化、env 校验、邮件模板 | `tests/unit/` | `vitest run --project unit` |
| 组件 | 单页面 / 单组件的交互与渲染：表单校验、菜单开关、断点布局、文案 | `tests/components/` | `vitest run --project components`（jsdom） |
| E2E | 跨页面、跨服务的用户旅程：注册登录、个人中心读写、模块门禁、关键页面可访问 | `e2e/` | `pnpm test:e2e`（Playwright） |

另有 `tests/workers/`，在 Cloudflare Workers 运行时里跑，用 `pnpm test:workers` 单独执行，
不并入 `pnpm test`。

## 什么该写 E2E

新增 E2E 前先问这两句：

1. **这条用例守的是哪条核心流程？** 答不上来就下沉到组件测试。
2. **它真的需要真实浏览器、真实服务端、真实数据库吗？** 只是元素位置、断点下的溢出、
   动画开关、hover 位移、锚点滚动、TOC 结构、单个字段的校验提示、静态文件内容
   （sitemap / robots / manifest）的话，用组件测试或构建期断言覆盖，成本低一个数量级。

单条 spec 保持在 10 条以内，整套 E2E 目标 5 分钟内跑完。跨语言行为由单元测试覆盖，
E2E 只在一个 locale 上跑主流程。

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm test` | 全部单元 + 组件测试 |
| `pnpm test:affected` | 仅跑受影响的测试 |
| `pnpm test:watch` | watch 模式 |
| `pnpm test:workers` | Workers 运行时测试 |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm test:e2e:ui` | Playwright UI 模式 |
| `pnpm exec vitest run --project unit` | 只跑单元测试 |
| `pnpm exec vitest run --project components` | 只跑组件测试（jsdom） |

`pnpm test` 会先跑 `locale:compile`，在非交互环境可能被提问卡住——CI 里按 `--project`
分开跑更稳。

E2E 会启动一个测试专用 server，端口被占用时换一个：

```bash
E2E_BASE_URL=http://localhost:3107 pnpm test:e2e
```

## 两个坑

- **点按钮前要等水合。** 水合未完成时点击会静默失败——没有报错、没有导航，表现和
  产品 bug 完全一样。
- **并发注册的邮箱要加随机段。** 只用 `Date.now()` 在 `fullyParallel` 下会撞车。

测试文件放哪、怎么配模块开关见 [目录结构](./project-structure)；表单相关的组件测试见
[表单约定](./forms)。
