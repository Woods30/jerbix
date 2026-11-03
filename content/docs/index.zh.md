---
title: 文档概览
description: 这套文档按什么顺序读
locale: zh
order: 0
group: start
updated: 2026-11-03
---

这套文档按「先跑起来 → 再改配置 → 然后部署 → 最后按需开模块」的顺序读。每个模块一页，
只写你要做的那一件事。

## 搭建流程

1. **跑起来。** 装依赖、初始化项目、创建 Cloudflare 资源，本地打开
   `http://localhost:3000` 就能看到站点。[快速开始](./getting-started)
2. **改配置。** 站名、Logo、主题、模块开关、社交链接集中在一个文件里。
   [网站配置](./configuration)
3. **部署。** 账号、Token、域名、Secrets 与自动部署。[部署到 Cloudflare](./cloudflare)
4. **按需开模块。** 支付、邮件、通知、分析各是一页，需要哪个开哪个。
   [支付总览](./payment)

## 文档地图

### 开始

- [快速开始](./getting-started)

### 配置

- [网站配置](./configuration)
- [导航与菜单](./navigation)
- [环境变量](./environment)

### 部署

- [部署到 Cloudflare](./cloudflare)
- [数据库](./database)
- [文件存储](./storage)
- [缓存](./cache)

### 认证与账户

- [登录与注册](./auth)
- [个人中心](./auth-account)
- [API 密钥](./api-keys)
- [用户与管理员](./user-management)

### 支付

- [支付总览](./payment)
- [Stripe](./payment-stripe)
- [Creem](./payment-creem)

### 邮件

- [邮件总览](./email)
- [Resend](./email-resend)
- [Cloudflare Email](./email-cloudflare)
- [邮件订阅](./newsletter)

### 通知

- [通知](./notifications)

### 分析

- [分析](./analytics)

### 开发

- [目录结构](./project-structure)
- [表单约定](./forms)
- [设计系统](./design-system)
- [测试](./testing)
