---
title: 文档概览
description: 模板工程的使用说明：快速开始、站点配置、部署与各功能模块
locale: zh
order: 0
updated: 2026-11-02
---

这套文档描述一个可直接部署的 SaaS 起步工程：TanStack Start 应用、Cloudflare Workers
运行时，以及按开关装配的认证、支付、邮件等模块。文档随代码演进，没有与实现脱节的版本。

## 从哪里开始

- [快速开始](./getting-started)——从克隆到上线的一条线，含 `pnpm run init` 的用法。
- [网站配置](./configuration)——站名、Logo、模块开关都集中在一个文件里。
- [环境变量](./environment)——两层 env 模型，以及每个变量归谁管。
- [Cloudflare 部署](./cloudflare)——域名、Secrets、Variables 与自动部署。

## 文档地图

| 分组 | 覆盖内容 |
|---|---|
| 开始 | 从克隆到跑起来 |
| 配置 | 站点配置、导航与环境变量 |
| 部署 | Cloudflare、D1、存储与缓存 |
| 功能 | 集成、认证、邮件、订阅、支付、通知、分析、API 密钥与用户管理 |
| 开发 | 目录结构、设计系统、表单与测试 |

## 约定

- 命令一律以 `pnpm` 开头，脚本定义在 `package.json`。
- 配置文件位置固定：`src/config/website.ts`（站点配置）、`src/config/products.ts`（套餐）、
  `wrangler.jsonc`（部署与绑定）、`.env`（本地环境变量）。
- 金额只存在于服务商的价格目录，代码里不存第二份。
