---
title: 快速开始
description: 从克隆到上线的六个步骤
locale: zh
order: 1
group: start
updated: 2026-11-03
---

从克隆仓库到线上可访问，一共六步。每一步都给命令，跑完就能看到结果。

## 前提

| 需要 | 说明 |
|---|---|
| Node.js 22 / 24 | `package.json` 的 `engines` 允许 `^22.12.0`、`^24.0.0` 及更高 |
| pnpm | 版本由 `package.json` 的 `packageManager` 指定（当前 `pnpm@12.4.2`），不要用别的版本 |
| Cloudflare 账号 | 可选。没有也能先在本地跑通，部署与建资源时才需要 |

## 步骤

1. **安装依赖。**

   ```bash
   pnpm install
   ```

2. **把它变成你自己的项目。**

   ```bash
   pnpm run init
   ```

   脚本问站点名、短名、生产域名、支持邮箱，以及要开哪些模块，然后一次性改好：`package.json`
   的包名、`messages/zh.json` 与 `messages/en.json` 的品牌文案、`public/manifest.json` 的站点名、
   `src/config/website.ts` 的站名 / 字标强调色 / 支持邮箱 / 模块与功能开关、
   `src/config/products.ts` 的一次性商品名、`wrangler.jsonc` 的 Worker 名 / 域名 / 资源名，
   以及 `.env` 里空着的 `BETTER_AUTH_SECRET` 与站点地址。不想交互就一次给全：

   ```bash
   pnpm run init -- --name "<your-site-name>" --slug <your-slug> \
     --domain <your-domain.com> --email <your-support-email> --modules docs,auth
   ```

   `--dry-run` 只打印将要改动的文件，`--non-interactive` 不提问。

   > 初始化脚本**默认把所有模块关掉**（`docs`、`blog`、`mail`、`payment` 等不在
   > `--modules` 名单里就是关的）。模板出厂时这些模块是开的，而它们各自要凭据，
   > 全开会让什么都没配的克隆者卡在生产校验上。按需再开，见[网站配置](./configuration)。

3. **创建 Cloudflare 资源并写好本地环境变量。**

   ```bash
   pnpm run setup
   ```

   `setup` 与 `init` 的分工：`init` 只改代码与文案，不碰云端；`setup` 在你的账号下建（或复用）
   D1 数据库与 KV namespace，把资源 ID 写回 `wrangler.jsonc`，把 `CLOUDFLARE_DATABASE_ID` 与
   `BETTER_AUTH_SECRET` 写进 `.env`，并顺手应用一次本地迁移。它还会问你要不要 Stripe / Creem、
   哪种邮件 provider、要不要 Discord 通知，填了就一并写进 `.env`。

   已有的 `.env` 值不会被覆盖：重跑一次 `setup` 不会换掉你的 `BETTER_AUTH_SECRET`，也不会把
   已登录的人踢下线。

   R2 **不会**被自动创建——bucket 要先在 Cloudflare Dashboard 开通一次（需绑支付方式，API
   代劳不了），手动步骤见[文件存储](./storage)。没有登录 Cloudflare 时脚本只警告、继续执行，
   本地开发用 D1 的 SQLite 模拟，不需要真实资源：

   ```bash
   pnpm exec wrangler login
   ```

4. **启动开发服务器。**

   ```bash
   pnpm dev
   ```

   打开 `http://localhost:3000`。数据库没初始化成功就手动跑一次：

   ```bash
   pnpm run db:migrate:local
   ```

5. **改站点信息。** 站名、Logo、主题配色、模块开关、社交链接都在 `src/config/website.ts`，
   逐项见[网站配置](./configuration)。

6. **部署。**

   ```bash
   pnpm deploy
   ```

   依次跑生产 env 校验 → 构建 → 客户端 bundle 泄漏检查 → `wrangler deploy`。

## 验证

- 本地：浏览器打开 `http://localhost:3000`，首页正常渲染即通过。
- 线上：`pnpm deploy` 输出里带线上地址（`<Worker 名>.<账号子域>.workers.dev`），能打开即通过。

## 注意事项

- secret 绝不能带 `VITE_` 前缀：`VITE_` 变量在构建时就被内联进浏览器 bundle，任何访客都能
  看到。`pnpm check:client-bundle` 会扫描构建产物，发现泄漏即失败。
- 本地 `.env` 里的值**不会**自动变成生产 secret。生产值要单独配（GitHub production
  Environment 或 `wrangler secret put`），见[环境变量](./environment)。
- 部署前把 `.env.production` 的 `VITE_BASE_URL` 改成真实 HTTPS 域名，
  `pnpm check:env:prod` 会拒绝 `localhost` 与占位域名。

配好后可以接着看[网站配置](./configuration)与[部署到 Cloudflare](./cloudflare)。
