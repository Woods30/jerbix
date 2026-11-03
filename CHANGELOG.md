# 更新日志

本文件记录**官网工程**的版本变化。模板工程（`Woods30/saas-template`）有独立的发布记录，不在本文件里。

## 未发布

### 特性与调整

- 官网不再提供 `/docs`：`docs` 模块关闭后整棵文档子树以 404 呈现，导航、页脚与首页 CTA 的「文档」入口改指外部文档站 <https://docs.jerbix.site>。
- 文档站独立成第二个 Worker（`jerbix-docs` → `docs.jerbix.site`），与官网 Worker 各发各的，互不影响。
- 新增购买常见问题页（交付流程、授权与再销售边界、第三方费用、部署与文档入口、更新与支持范围、退款例外情形），服务条款与它互相链接；条款性内容仍以服务条款为准。
- 模块与能力开关可用环境变量覆盖（`VITE_MODULES` / `VITE_FEATURES` / `VITE_DOCS_AS_HOME`），同一份代码能发到不同场景。
- 官网移除候补名单页（`pages.waitlist: false`）：页面、导航、页脚与 sitemap 中的入口一并消失。
- 文档站改为根路径：`docs.jerbix.site/zh/getting-started`，不再嵌套 `/docs`；旧 `/docs/*` 地址 301 到新地址。文档中心侧边栏第一项是「返回官网」，logo 仍回文档首页。
- 同步模板仓 0.10.0：代码内置 Creem 支付渠道（官网仍用 Stripe），服务诊断按当前渠道校验。

### 修复

- 部署工作流按名字解析 D1 / KV 资源 ID：仓库里写死的 ID 可能属于别的账号，部署会以「KV namespace not found」失败。
- 冒烟路径换成 `/pricing`，并在 `auth` 模块关闭时跳过认证端点检查（该端点本就是 404，不是故障）。
- 没有自定义域名权限时，部署可退回 workers.dev，域名之后再在 Dashboard 里挂。

## 0.8.1 (2026-10-30)

### 特性与调整

- 价格目录缓存缩短到 60 秒（KV 允许的最小值）：改价 1 分钟内生效，不必等 10 分钟。
- `invoice.paid` 成为支付成功的权威事件：Stripe 不保证事件顺序，端点也可能只投递 `invoice.*`。付款记录不再单点依赖 `checkout.session.completed`；一次性支付的发票也带归属 metadata，发票事件单独到达时仍能定位用户。两条事件路径统一用 PaymentIntent 作外部 ID，同一笔钱只写一条记录。

### 修复

- 支付成功后没有付款与订阅记录：webhook 端点漏配 `checkout.session.completed` 时，事件返回 200 但 `payments` / `subscriptions` 表一行都没写。文档现在列出必须订阅的事件清单。

## 0.8.0 (2026-10-30)

### 特性与调整

- 价格收敛为单一事实源：金额只存在于 Stripe 的价格目录，首页展示、`llms.txt` 与结账收款读同一份目录，代码与配置不再存第二份金额。改价只需在 Stripe 后台操作，不必发版。
- 首页价格取不到时降级为「价格暂不可用」，不再因取价失败让整页失败。
- 结账 400 区分错误来源：只有价格不可用才提示「该方案暂未开放购买」，参数非法或回跳地址不被信任时显示通用错误，避免把请求问题误导成价格问题。

### 修复

- E2E 不再硬编码价格金额：价格是运营可变的事实源，改价后断言不会变成假失败。

## 0.7.0 (2026-10-30)

### 特性与调整

- 新增面向 AI 抓取器的站点索引与全文包，中英各一套：`/llms.txt`、`/llms.zh.txt`（定位、技术栈、包含什么、价格与文档清单），`/llms-full.txt`、`/llms-full.zh.txt`（全部文档正文，纯 Markdown）。
- llms 文案集中在 `src/config/llms.ts`，正文取自 `content/`；改配置或加文档自动生效，价格读 `websiteConfig.template.priceUsd`，链接按语言前缀拼绝对 URL。
- `robots.txt` 显式放行 GPTBot、OAI-SearchBot、ChatGPT-User、ClaudeBot、Claude-User、Claude-SearchBot、PerplexityBot、Google-Extended、Bytespider、CCBot，检索与训练都收录。
- `sitemap.xml` 增加 `lastmod`：文档取 frontmatter `updated`，博客取 `date`；无日期来源的静态页不输出，不编造。

### 安全

- llms 文件不收录未发布的博客，站点私有的模板占位符按类型脱敏后输出。

## 0.2.0 (2026-10-29)

### 特性与调整

- 支付配置简化为产品与销售引用，站点选择一个支付服务商；当前内置 Stripe。
- 同一账号最多一份未终止订阅，一次性商品可重复购买，订阅管理交给服务商 Portal。
- 移除站内换档、等级互斥、买断接管与待生效降级调度，统一 Webhook 持久化与结账并发保护。
- 首页更新为 Jerbix 模板销售页，提供源码与界面联动循环演示、完整源码、永久支持与免费升级说明。
- 模板通过独立 `jerbix_template` 引用以 USD 99 一次性购买；登录、注册及邮箱验证保留购买回跳。
- 定价统一至首页 `#pricing`，旧 `/pricing` 跳转当前语言首页价格区。

### 修复

- 修复复用 Stripe 客户时的 Checkout 参数冲突。
- 结账预留释放前核对服务商会话与订阅状态，避免 Webhook 延迟造成重复订阅，并支持订阅终止后重新购买；响应丢失时复用原请求、幂等键与过期时间。
- 同步首页中英文 E2E 断言，生产环境校验前先生成 locale，避免全新 checkout 部署失败。

### 升级说明

- 新增迁移 `0008_payment_simplification.sql`，要求空白支付表，不转换历史支付数据。生产迁移前必须备份并审查现有数据，不可直接应用到包含历史支付数据的生产库。
- 部署前配置生产支付凭据及 Webhook，并核对启用的通知与分析服务配置。此版本发布不会自动迁移生产数据库。

## 0.1.0 (2026-10-12)

首次公开版本。

### 特性

- TanStack Start + Cloudflare Workers 骨架
- Better Auth（邮箱密码 + Google OAuth，可选）
- Stripe Checkout + Customer Portal + Webhook
- Cloudflare D1 / KV / R2 / Email 集成
- 8 个营销 blocks
- 多语言（zh / en，URL 前缀）
- PWA + SEO（sitemap / robots / JSON-LD / 静态 OG 图）
- 多 analytics（GA / Plausible / Umami / Clarity）
- 自托管多 provider 注册表
- Playwright E2E + Vitest 单元 + 组件
- GitHub Actions CI
