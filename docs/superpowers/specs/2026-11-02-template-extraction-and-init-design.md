# 模板工程抽取与初始化脚本

- 日期：2026-11-02
- 状态：待执行
- 相关 ADR：`docs/adr/0004-template-and-official-site-split.md`、
  `docs/adr/0005-init-replacement-table.md`

## 意图

`Woods30/saas-template` 现在是**两样东西挤在一个仓里**：

1. 一个可复用的 SaaS 模板（TanStack Start + Cloudflare Workers）；
2. 一个用这个模板做出来的商业站点 —— **Jerbix**：模板的品牌、官网、以及把模板源码
   以一次性付费（USD 99）卖出去的支付链路。

两者的生命周期已经分叉：模板该被无数人复用，Jerbix 官网该自己迭代；模板该有独立的版本、
文档与发版节奏，官网该有独立的商业条款与交付流程。继续挤在一个仓里的代价是每一次改
「模板怎么用」都要先确认「会不会影响官网在卖的东西」。

**解法**：把模板工程抽出来成为独立工程，配套一个初始化脚本，让「从模板得到一个自己的
项目」成为一条命令。

## 目标

- 模板工程成为独立仓，可运行、可测试、可发版，与官网仓通过 Git 关系同步。
- 提供 `pnpm run init`：一条命令把模板变成本地开发者的项目（改名、换域名、选模块、
  生成 env、重置资源标识、装 git hooks），默认只跑本地，不产生任何云端副作用。
- 官网仓（Jerbix）保留现有 Git 历史与生产部署，定位收敛为「模板的官网 + 支付」。
- 文档按用途分两层：技术文档跟模板走，商业条款文档跟官网走。

## 非目标

- 不改运行时行为：路由、API、数据库 schema、认证流程、支付协议一律不动。
- 不做自动交付：买家的源码交付仍是人工（见「现状事实 2」），本次不引入授权码、
  下载站或购买邮件。
- 不发布 npm 包：`saas-template` 与 `create-saas-template` 在 npm 上均被无关项目占用，
  走 `create.sh` + GitHub Release。
- 不引入新的运行时依赖。
- 不动 Stripe 上的既有价格目录：`jerbix_template` 等 lookup key 仍在 Stripe 后台为事实源。

## 术语

| 术语 | 含义 |
|---|---|
| **模板工程** | 独立仓 `Woods30/saas-template`：模板源码 + 技术文档 + init 脚本。默认品牌为 Jerbix。 |
| **官网工程** | 现有仓（改名后为 `Woods30/jerbix`）：模板的官网 + 支付 + 商业条款文档。 |
| **实例项目** | 开发者用 init 脚本从模板工程生成的项目。 |
| **init 脚本** | 模板工程内的 `pnpm run init`，把模板改造成实例项目的工具。 |
| **替换表** | init 脚本内声明式的「文件 → 改什么」清单，是唯一需要随模板演进而维护的地方。 |

## 已定决策（用户确认）

| 议题 | 决策 |
|---|---|
| 交付形态 | 仓内 `pnpm run init` + 一个 `create.sh` 薄壳（拉副本 → 建新目录 → 调 init） |
| 一键的边界 | 改名 + 重置资源标识 + 选模块（默认全关）+ 生成 `.env` + 装 git hooks + 跑本地迁移；**默认只跑本地** |
| 幂等性 | 文本类改动幂等；git 初始化检测式；`.env` 读-改-写合并，不再整体覆盖 |
| 品牌替换机制 | 声明式替换表（不是占位符 token，不是全仓正则） |
| 拆分形状 | 官网仓保持不动、保留历史与生产部署；模板工程另开新仓 |
| 品牌资产 | 默认沿用 Jerbix 的品牌图；用户提供了新素材才替换 |
| 模板工程本身 | 可运行、可测试、可发版 |
| init 脚本位置 | 模板工程内 `scripts/init/`；不发布 npm 包 |
| 模板 ↔ 实例同步 | 不跟进，各走各的；实例仓保留 `template` remote 作为日后挑选的口子 |
| 官网 ↔ 模板同步 | 模板仓是唯一源码源；官网仓保留完整代码副本，靠 Git 合并跟进 |
| 商业能力归属 | `template` 一次性商品由 init 按参数生成；模板仓不含 Jerbix 商业痕迹 |
| 文档归属 | 技术文档跟模板走并由模板仓部署；商业条款文档跟官网走；官网 `/docs` 改外链 |
| Logo | wordmark 与图形拆开，文字由 `metadata.name` 动态渲染 |
| 版本关系 | 模板仓公开发布 GitHub Release；买家拿购买时冻结的 tag |
| Git 历史 | 模板仓由现仓的 `template` 分支直接推送，保留共同祖先 |
| 本轮交付范围 | 先做「模板工程 + init 脚本」，官网仓暂不动 |

## 现状事实（已核实）

### 1. 品牌面：面小，但有两个独立源

`Jerbix` 在 68 个受版本控制的文件里出现 438 次（另有 `.superpowers/` 604 次、
`dist/` 305 次，均为未跟踪或生成物）。按目录归类：

| 位置 | 文件数 | 说明 |
|---|---|---|
| `src/` | 7 | `config/website.ts`、`config/products.ts`、`config/llms.ts`、`BrandLogo.tsx`、`SourceProductDemo.tsx` + 2 个品牌 SVG |
| `messages/` | 2 | zh / en 各 19 处 UI 文案 |
| `tests/` | 22 | 其中 7 个文件是**硬编码品牌断言**，改名后必然红 |
| `content/` | 14 | 文档 + legal |
| `public/` | 6 | logo / icon / favicon |
| `docs/` | 9 | 本项目的开发史（plans / specs） |
| 其他 | 6 | `wrangler.jsonc`、`README.md`、`DESIGN.md`、`CONTEXT.md`、`CHANGELOG.md`、`AGENTS.md` |

**两个独立的品牌源**，只改一处会让 `<title>` 与 OG 站点名不一致：

- `src/config/website.ts:104` → `metadata.name`（被 footer / OG / JSON-LD 使用）
- `messages/{en,zh}.json:623` → `site_name`（被 `src/routes/__root.tsx:38` 使用）

**图形资产无法用字符串改名**：`src/components/layout/brand/jerbix-horizontal.svg` 的 wordmark
是转曲后的 path（`<text>` 元素数为 0），且 `BrandLogo.tsx:26-33` 有一张 `jbx-*` class →
`fill`/`stroke` 的映射表。

### 2. 商业面：Jerbix 专属只渗进了 5 处

payment / auth / mail / db 栈整体是 provider 中立、product 中立的。Jerbix 专属的只有：

| 位置 | 内容 |
|---|---|
| `src/config/products.ts:29-35` | `template` product 条目（`name: 'Jerbix'` 写死、`prices.once: 'jerbix_template'`） |
| `src/config/website.ts:50,118` | `template: { productId, offerId }` 字段，5 个读取点：`routes/index.tsx:26-30`、`LandingPage.tsx:282`、`checkout-client.ts:28-30`、`api/payment/$.ts:62`、`llms-response.server.ts:36-40` |
| `src/payment/price-catalog.ts:20-29` | `isTemplatePriceValid()` —— 只服务一次性 USD 价格 |
| `src/payment/checkout-client.ts:28-30` | cancelUrl 分支 |
| `src/routes/api/payment/$.ts:62` | 服务端价格门禁 |

`free` / `pro` / `lifetime` 三个 product 是**配置型 fixture**：UI 里没有购买入口
（`src/components/sections/Pricing.tsx` 是死代码，仅被测试引用），但它们的 lookup key
会被 `collectPriceReferences()` 拿去 Stripe 查询。

⚠️ **现存假阳性**：`src/config/service-status.ts:141` 用 `collectPriceReferences().length > 0`
当 payment 的健康检查 —— 这三个 fixture 让它恒为真，于是只要填了 `STRIPE_SECRET_KEY`，
payment 就报 `configured`，哪怕 Stripe 账号里一个 price 都没有。

**交付完全人工**：全仓没有任何自动交付机制 —— 无下载、无授权码、无 GitHub 邀请、无购买邮件
（`src/mail/types.ts` 只有 `verifyEmail` / `forgotPassword` / `contactMessage` / `welcome` 四个
模板）。一次购买只写一条 `payments` row（`type='one_time'`, `productId='template'`）与一条
`webhook_events` row。

### 3. 文档面：子树自包含，可独立部署

- 44 个文件 = 22 个 slug × 2 语言，5 个分组（`start` / `config` / `deploy` /
  `features` / `develop`）。
- **200 个文档间链接全部是相对路径 `./slug`**（slug 与语言无关，语言切换安全）；
  唯一的绝对路径是 8 处 `/docs/screenshots/*.png`（图在 `public/docs/screenshots/`）。
  **没有一个链接指向非文档路由。**
- docs 路由用**自己的 layout**（`DocsLayout`），不在 marketing layout 的祖先链上；
  `src/components/docs/**` **零 auth / DB / Stripe 依赖**。
- 搜索是纯客户端的（`searchDocs()` 在浏览器里扫全文），没有构建期索引；但 44 篇文档的
  完整 markdown 会被打进客户端 bundle（约 252 KB）。
- `messages/{en,zh}.json` 是**整站**文件，文档独立部署需要抽出子集（22 个 `docs_*` 键 +
  `nav_docs` + `locale_label` + `theme_*` + `error_404_*`）。

**两个顺带挖出的缺陷**：

- **canonical 与 hreflang 不一致**：docs 的 `head()` 调 `seo('/docs/${slug}')`，
  `getCanonicalUrl` 产出 `https://base/docs/payment`（**无语言前缀**），hreflang 却是
  `https://base/en/docs/payment`（有前缀）。这与 `src/lib/seo.ts:48-49` 自己的注释
  「本仓 canonical 一律带语言前缀」矛盾，且被 `tests/unit/content-head.test.ts:108` 钉死。
- **`content/docs` 没有 `index.md`**：`/docs` 靠 `order` 落到 `getting-started`；文档独立
  成域后 `/` 需要重定向。

### 4. 部署面：三处会被拆分打断的耦合

| 位置 | 内容 | 拆分后 |
|---|---|---|
| `.github/workflows/deploy.yml:170` | `const kvTitle = 'saas-template-cache'` —— 写死，不像 D1 那样从 `wrangler.jsonc` 读 | 必须改成从配置读 |
| `.github/workflows/deploy.yml:274` | 冒烟测试硬检 `for path in / /docs/getting-started` | 文档移出官网后必挂 |
| `.github/workflows/deploy.yml:43` | Release tag 必须等于 `package.json` 的 `version` | 两仓各有版本号，关系待定 |

`wrangler.jsonc` 里必须重生成的账号相关值：`name: "jerbix"`、`routes[0].pattern:
"www.jerbix.site"`、`d1_databases[0].database_name` / `database_id`、`kv_namespaces[0].id`。
其中 `database_id` 与 `kv id` 是**当前账号的真实 ID**，直接发给别人等于让别人部署进你的
数据库。

`.content-collections/generated/` **被提交进了 git**（尽管 `.gitignore` 列了它），里面渲染
出的 privacy / terms 含品牌与真实邮箱。

### 5. env 面

- 只有 `.env.example` 一份 env 模板；**没有** `.env.sample` / `.env.template`。
- `.env.example` **缺** `CLOUDFLARE_DATABASE_ID`（`drizzle.config.ts:12` 直接读
  `process.env`）、`DATABASE_URL`、`VITE_UMAMI_ID`、`VITE_CLARITY_ID`。
- `scripts/setup.ts` 有三个缺陷：① `writeEnv()` **整体覆盖** `.env`（注释全丢）；
  ② `wrangler.jsonc` 走 `JSON.parse` → `JSON.stringify` 回写，**所有注释被抹掉**；
  ③ 它会**启用 R2 bucket**，而仓库里 R2 是**故意注释掉**的（需先在 Dashboard 开通一次，
  API 代劳不了，会返回 10042）。
- `package.json` 有 `simple-git-hooks` 配置但**没有 `postinstall` / `prepare`**，所以新克隆
  的仓库没有 pre-commit hook。

### 6. 仓库面

- 公开仓，265 条提交，1 个 tag（`v0.2.0`），5 个分支。
- `.superpowers/` 是 67 MB 的 agent 草稿（未跟踪），含 `jerbix-home-v1.html` 等。
- `docs/superpowers/plans|specs` 共 23 篇本项目开发史，含本地绝对路径
  （`/Users/alvinyao/Downloads/jerbix-brand-assets 2`）。

## 方案

### 1. 两个仓的职责与关系

| | 模板工程 | 官网工程 |
|---|---|---|
| 仓 | `Woods30/saas-template`（新建） | `Woods30/jerbix`（现仓改名） |
| 内容 | 模板源码 + 技术文档 + init 脚本 + 商业骨架 | 官网源码 + 支付 + 商业条款文档 |
| 品牌 | 默认 Jerbix | Jerbix |
| 部署 | 文档站（独立域） | 官网（`www.jerbix.site`） |
| Stripe | 无（实例项目自己建） | `jerbix_template` 等 |
| 同步 | 唯一源码源 | 保留完整代码副本，`git merge template/main` 跟进 |

**为什么官网仓保留完整代码副本**（而不是退化成「品牌 + overlay」仓或合并成一仓）：官网仓
牵连生产部署（自定义域名、D1 / KV 真实 ID、`deploy.yml` 的 secret 白名单、GitHub
`production` Environment）。退化成 overlay 仓要重写整条部署链，合并成一仓要迁移历史 ——
两者都要推翻「现仓不动」这个前提。保留副本的代价是两份代码会漂移，用「模板仓发 tag →
官网仓一条合并流程」来控。

### 2. 模板工程的内容边界

| 内容 | 去向 | 理由 |
|---|---|---|
| `src/` 全部代码 + 测试 | 模板仓 | 模板本体 |
| `content/docs/` 22 个技术 slug | 模板仓 | 模板的使用手册，跟模板走才对 |
| `content/legal/` 骨架（占位符版） | 模板仓 | 买家部署自己的站也需要这两份 |
| `content/legal/` 填好的版本 | 官网仓 | 写的是 Jerbix 这个经营主体 |
| 商业条款文档（购买须知 / 交付 / 授权 / 退款 / FAQ） | 官网仓 | 全新内容，本次不写 |
| `content/blog`、`content/changelog` | 删（留目录 + 一篇「怎么写第一篇」） | 示例内容，不是模板能力 |
| `messages/{en,zh}.json` | 模板仓（去品牌） | 整站文件，两边都要用 |
| `public/` 品牌资产 | 模板仓（默认沿用 Jerbix） | 见 §6 |
| `docs/adr/` | 模板仓 | 架构决策对新项目仍成立 |
| `docs/operations/` | 模板仓 | wrangler bindings 运维细节 |
| `docs/superpowers/plans|specs` | 删 | 本项目的开发史，含本地绝对路径 |
| `.superpowers/` | 删 | agent 草稿 |
| `CHANGELOG.md` | 模板仓另起 | 现内容是官网的发布记录 |
| `.content-collections/generated/` | 从索引删除 | 生成物，误提交了；构建时重新生成 |

**「卖模板」能力在模板仓的形态**：`template` product **不由模板仓声明**，而是由 init 按参数
生成（`--one-time-product`）。模板仓保留 `free` / `pro` / `lifetime` 作为「用户自己的
SaaS 套餐」示例，但它们必须有对应开关：**init 默认把 payment 模块关掉**，关掉时这三个
lookup key 不会被查询，也就不要求用户的 Stripe 账号里有它们。

同时把 `isTemplatePriceValid()` 泛化为「一次性商品的校验」（例如
`isOneTimePriceValid(price, { currency: 'usd' })`），让它不再以 `template` 命名 —— 模板仓
里不该有以官网业务命名的函数。

### 3. init 脚本

#### 3.1 形态

```
scripts/init/
├── index.ts          # CLI 入口（pnpm run init）
├── questions.ts      # 交互式提问（@inquirer/prompts，已在依赖里）
├── plan.ts           # 从配置生成变更计划（纯函数）
├── apply.ts          # 执行计划（纯 IO）
├── replacements.ts   # 声明式替换表
└── env-merge.ts      # .env 读-改-写合并
```

入口：`"init": "tsx scripts/init/index.ts"`。

**计划 / 执行分离**是刻意的：`plan.ts` 是纯函数（配置 → 变更清单），可以在单测里断言
「改了哪些文件、哪一行」；`apply.ts` 只负责把计划落到磁盘。

#### 3.2 参数与交互

| 参数 | 含义 | 默认 |
|---|---|---|
| `--name <站点名>` | 站点展示名 | 交互提问，缺省取目录名 |
| `--slug <小写短名>` | Cloudflare 资源前缀、包名后缀 | 从 `--name` 推导（转小写、连字符） |
| `--domain <域名>` | 生产域名 | 交互提问，缺省 `<slug>.example.com` |
| `--email <支持邮箱>` | `mail.supportEmail` | 交互提问，缺省 `support@<domain>` |
| `--modules <列表>` | 要开启的模块 | 默认**全关** |
| `--one-time-product <id>` | 生成一次性商品 | 不生成 |
| `--logo <路径>` | 自定义 logo 素材 | 不提供则沿用默认素材 |
| `--from <tag>` | 模板版本 | 缺省当前 HEAD |
| `--non-interactive` | 不提问，全部用默认值 | — |

**交互为默认，全部问题有默认值** —— 开发者一路回车也能得到一个合理结果。`--non-interactive`
供脚本化场景使用，也是端到端测试的入口。

**模块默认全关**：`docs` / `blog` / `changelog` / `mail` / `contact` / `newsletter` /
`payment` / `notification` / `analytics` / `auth` 全部关闭；`features.*` 全部关闭。理由：
模板出厂时这四个模块是开的，而 `auth.requireEmailVerification=true` + `mail` 不完整会让
`/api/auth/*` 返回 503，`analytics` 缺 `VITE_GA_ID` 会让 `pnpm check:env:prod` 硬失败 ——
**一个什么都不配的克隆者，当前是跑不通生产校验的**。

#### 3.3 替换表

替换表是 init 唯一需要随模板演进而维护的地方，因此它必须是**声明式的、可单测的**，
而不是散落的 `sed`。它同时**避免了两个陷阱**：

- **两个品牌源**（`websiteConfig.metadata.name` 与 `messages.site_name`）必须成对出现，
  否则 `<title>` 与 OG 站点名打架；
- **并非每处 `Jerbix` 都该换成新品牌**。例如 `SourceProductDemo.tsx:112,125` 的
  `'Jerbix'` 是演示里的「改之前」状态 —— init 之后它应当**保持原模板品牌**，
  而「改之后」那一侧（`m.home_demo_brand()`，当前值 `你的品牌` / `Your brand`）才填入
  新品牌名。同理 `home_mascot_alt`（`向前跃起的 Jerbix 跳鼠吉祥物`）在默认沿用 Jerbix
  吉祥物时应当**排除**在替换之外。

因此替换表支持三类条目：

| 类别 | 例子 |
|---|---|
| **品牌字面量替换** | `messages/*.json` 中的 19 处 `Jerbix` → 新品牌名 |
| **占位符填充** | `home_demo_brand` 的 `你的品牌` → 新品牌名 |
| **排除项** | `SourceProductDemo` 的「改之前」品牌、`home_mascot_alt` |

结构化文件（`package.json`、`public/manifest.json`、`messages/*.json`）按 **JSON 解析后
改再写回**；`wrangler.jsonc` **必须保留注释**，用带注释保留的正则改写（`setup.ts` 现在的
`JSON.stringify` 回写会抹掉全部注释，不能照抄）；`src/config/website.ts` 与
`src/config/products.ts` 按**配置项**改而不是按字符串改。

**测试兜底**：一条单测断言「替换表覆盖了代码与消息里所有品牌字面量」——用一张反向清单
（品牌出现的位置 → 期望的替换类别），任何新增的品牌引用如果没登记就会红。这是替换表
唯一的维护成本，用测试把它变成可发现的。

#### 3.4 幂等

| 类别 | 行为 |
|---|---|
| 文本类改动 | 已是目标值则跳过，重跑不炸 |
| 结构化改写 | 同上（比较解析后的值，不比较文本） |
| git 初始化 | 已是新仓则跳过并提示 |
| `.env` | **读-改-写合并**，只更新脚本自己管的 key，其余保留 |

`.env` 的合并要**保留注释与顺序**（逐行处理，只替换 `KEY=VALUE` 行、只追加缺失的 key），
不能像现在的 `setup.ts` 那样整体覆盖。

#### 3.5 init 跑完做什么

1. 改品牌（替换表）→ 改 `package.json` name / version → 改 `wrangler.jsonc` 的 `name` /
   `routes` / 资源名（`database_id` / `kv id` **置为占位符**，真实值由部署流程回填）
2. 按 `--modules` 改 `src/config/website.ts` 的模块开关
3. 从 `.env.example` 生成 `.env`（**补全后的清单**），写入 `BETTER_AUTH_SECRET`（随机 32 字节）、
   `VITE_BASE_URL`、`BETTER_AUTH_URL`、`MAIL_FROM`（若启用 mail）等
4. `git init`（若还不是新仓）+ 首次提交前的 `pnpm exec simple-git-hooks`
5. `pnpm db:migrate:local`（本地 D1 模拟，不碰云端）
6. 打印下一步：`pnpm dev` / `pnpm run setup`（建云端资源）/ `pnpm deploy`

**明确不做**：不碰 Cloudflare 账号、不碰 Stripe、不装依赖（依赖由开发者自己
`pnpm install`，避免脚本在别人机器上跑半小时）。

#### 3.6 `create.sh`

薄壳，四五十行 bash：`git clone` 模板到临时目录 → 删除 `.git` → 移到目标目录 →
`pnpm install` → `pnpm run init --non-interactive --name <name> ...` → 删除临时目录。

GitHub 的 "Use this template" 按钮保留为兜底入口（它只能改仓名、不能跑脚本，属弱入口）。

### 4. 文档的两层归属与部署

**模板仓（跟模板走）**：`getting-started` / `configuration` / `navigation` / `environment` /
`cloudflare` / `database` / `storage` / `cache` / `integrations` / `auth` / `auth-account` /
`email` / `newsletter` / `payment` / `notifications` / `analytics` / `api-keys` /
`user-management` / `project-structure` / `design-system` / `forms` / `testing`。

**官网仓（跟官网走）**：购买须知 / 交付方式 / 授权范围 / 退款政策 / 购买 FAQ（本次不写）+
填好的 `privacy` / `terms`。

**部署形态**：模板仓部署**完整应用**到独立域（如 `docs.jerbix.site`），靠
`websiteConfig` 的模块开关关掉不需要的部分，**不裁剪代码**。理由：模板仓的 CI 本来就要
跑全应用的测试与构建，再引入一个裁剪变体意味着每次改代码要验证两套；额外成本只是一套
Cloudflare 资源与一份 env。

要真正裁出 docs-only worker，需要改 `src/server.ts`（砍掉 mail / newsletter /
notification / payment provider registry 与 D1 / KV / R2 binding，但**必须保留
`setServerSidebarGetter`** —— `src/lib/docs.ts:184-198` 靠它保证侧栏折叠状态的
SSR-hydration 一致）、砍掉 4 个 `llms*.txt` 路由（它们在请求时打 Stripe）、
`content-collections.ts` 的 `content` 收窄到 `[docs]`（连带处理
`src/lib/llms-source.server.ts:1` 与 `src/routes/sitemap[.]xml.ts:2` 两个 import 其他
集合的文件）、并抽出 `messages` 的 docs 子集。**本次不做**，记为独立议题。

**官网 `/docs` 改为外链**到模板仓的文档站；`deploy.yml` 的冒烟测试那条
`/docs/getting-started` 换成 `/pricing`。

**文档内容通用化**：11 个文档文件含 `www.jerbix.site`、支持邮箱、`jerbix_template`
lookup key、`USD 99` 等官网专属内容。归入模板仓的版本必须改成占位符写法
（`<your-domain>`、`<your-support-email>`、`<one-time-price-lookup-key>`），
且**不得使用 `{{EMAIL_*}}` 风格** —— `src/lib/llms.ts:113-124` 的 `sanitizePlaceholders()`
会在 llms 输出里把它们洗成 `EMAILX`。

### 5. 官网仓的改造（本次只做必要项）

- `/docs` 路由与 22 个技术 slug 从官网仓移出，导航的「文档」入口改外链。
- `deploy.yml:170` 的 `kvTitle` 改为从 `wrangler.jsonc` 读（与 D1 同款）。
- `deploy.yml:274` 的冒烟路径换成 `/pricing`。
- 商业条款文档补齐（本次不写，留待后续）。

### 6. Logo 与品牌资产

**默认沿用 Jerbix 的品牌图**（用户已定），但 wordmark 必须能随站名变化：

1. `src/components/layout/brand/jerbix-horizontal.svg` 拆为「mascot 图形」与「wordmark」
   两部分；`BrandLogo.tsx` 渲染 **mascot SVG + 由 `websiteConfig.metadata.name` 渲染的文字**。
   模板未改名时显示 mascot + 「Jerbix」，视觉与现在基本一致；init 改名后自动变成
   mascot + 新站名。
2. `metadata.images.logoLight` / `logoDark` 这两个**类型里已声明但当前无人使用**的字段
   接上「用户提供了自定义 logo」的场景：init 收到 `--logo` 时拷进 `public/` 并改这两个
   字段；`BrandLogo` 检测到自定义 logo 就用它替代 mascot + 文字。
3. `public/` 里其余资产（favicon 系列、`app-icon-*`、`mascot.png`、`logo.png`、
   `logo-horizontal-*.svg`、`icon-jerboa.svg`）**保留**。SVG 内的 `aria-label` 与
   `jbx-*` group id 含 `jerbix`，只影响无障碍文本与内部 id，不影响渲染；init 顺带把
   `aria-label` 改成通用描述即可。

⚠️ **已知取舍**：默认沿用 Jerbix 的品牌图意味着买家不提供素材时，站上会出现 Jerbix 的
吉祥物与配色。这是用户明确的选择；逃生舱是 init 的 `--logo` / `--mascot` 参数与
`metadata.images.*` 配置。

### 7. 同步机制

- 模板仓是唯一源码源，公开 GitHub Release，tag 形如 `v0.9.0`。
- 官网仓把模板仓加为 remote（`template`），模板发版后由人执行一次合并：
  `git fetch template && git merge template/main`。冲突面天然分层 —— 模板的通用代码 vs
  官网的定制（品牌文案、`template` product、商业条款文档）。
- 官网仓额外加一条 CI 提示：模板仓有新 tag 时在 PR 里提醒，但不自动合并。
- 买家拿到的版本是**购买时冻结的 tag**（人工交付，邮件发 tag 链接）。

**合并时必须保留官网版本的值**。模板仓是通用化后的版本，几处「具体值」在两仓里含义不同，
Git 会按「本地未改动」静默采用模板仓的版本，不会报冲突 —— 第一次合并必须逐项核对：

| 位置 | 模板仓的值 | 官网仓保留的值 | 弄错的后果 |
|---|---|---|---|
| `content/legal/**` | 骨架条款（占位符） | 填充版条款 | 官网的法律页变成占位符 |
| `src/config/products.ts` | `prices.once: 'one_time'` | 真实 Stripe `lookup_key` | 首页购买链接失效，且历史订单的 `productId` 对不上 |
| `src/config/website.ts` 的 `mail.supportEmail` | `support@example.com` | 官网真实支持邮箱 | 支持入口与联系表单收件地址失效 |
| `wrangler.jsonc` | 占位 worker 名、域名与资源 ID | 官网的 worker 名、`www.jerbix.site` 与真实 D1 / KV ID | 部署到错误的 Worker 与域名，生产站点下线 |
| `CHANGELOG.md` | 模板工程的发布记录 | 官网的发布记录 | 官网的发布历史被模板的覆盖 |
| `package.json` 的 `version` | 模板版本（`0.9.0` 起） | 官网版本 | Release tag 与 `package.json` 版本对不上，发版流程拒绝 |
| `README.md`、`CONTEXT.md` | 模板的说明与术语表 | 官网的说明与术语表 | 官网仓的说明变成模板说明，读的人以为这是模板仓 |
| `docs/superpowers/**` | 已删（模板仓不留本项目的开发史） | 官网的开发史原样保留 | 官网仓丢掉自己的开发记录 |

其余冲突（品牌文案、消息、模块开关）按「官网定制优先」处理。

### 8. 拆分模板仓的施工方式

1. 在现仓建分支 `template`；
2. 在该分支上做完「模板化」改造（去商业痕迹、通用化文档、加 init 脚本、拆 logo、
   删开发史）；
3. 把 `template` 分支推成 `Woods30/saas-template` 的 `main`；
4. 现仓改名 `Woods30/jerbix`，加 `template` remote，跑第一次合并。

**不用 `git filter-repo`**：改写历史会让两仓失去共同祖先 —— filter-repo 重写了每个受影响
commit 的 SHA，官网仓与模板仓从此是两条无关的历史，`git merge template/main` 只能靠
`--allow-unrelated-histencies`，冲突面全开。而「历史干净」的价值不大：没人会去翻模板仓
2026 年 10 月的提交历史。**保留共同祖先的价值**才大：官网仓跟进模板时从「每次
cherry-pick 一堆 commit」降级成「一次 merge」。

因此开发史（`docs/superpowers/`）与历史里的旧值用**普通提交**在 `template` 分支上删掉，
而不是改写历史。历史里残留的官网旧值（支持邮箱、价格引用、真实资源 ID）本来就公开在
官网仓里，模板仓再存一份不构成新的泄漏。

现仓随后改名 `Woods30/jerbix`（GitHub 改仓名会自动重定向旧链接），`Woods30/saas-template`
让给模板仓。

## 风险与对策

| 风险 | 对策 |
|---|---|
| 替换表漏掉新增的品牌引用 | 反向清单单测：品牌出现的位置 → 期望的替换类别，未登记即红 |
| `websiteConfig.metadata.name` 与 `messages.site_name` 只改一处 | 替换表把两者作为**一对**条目登记；单测同时断言两者 |
| `wrangler.jsonc` 的注释被抹掉 | init 用保留注释的正则改写；不抄 `setup.ts` 的 `JSON.stringify` 回写 |
| `.env` 被整体覆盖，开发者手填的值丢失 | 读-改-写合并，逐行处理；单测断言注释与未托管 key 保留 |
| `.env.example` 不完备导致 `pnpm check:env` 失败 | 本次补全清单（`CLOUDFLARE_DATABASE_ID` / `DATABASE_URL` / `VITE_UMAMI_ID` / `VITE_CLARITY_ID`） |
| `setup.ts` 默认启用 R2，而 R2 需要先在 Dashboard 开通 | 修 `setup.ts`：不启用 R2，改为提示；`scripts/setup.ts` 的三处缺陷一并修 |
| payment 健康检查假阳性 | `collectPriceReferences().length > 0` 换成「启用模块所声明的价格引用非空」 |
| 模板仓自带的 Cloudflare 资源 ID 泄漏 | 模板仓的 `wrangler.jsonc` 用占位 ID；部署流程按名字查找或创建并回填 |
| init 在别人机器上产生云端副作用 | init 只跑本地；建资源走独立的 `pnpm run setup`，由开发者显式执行 |
| 两仓代码漂移 | 模板仓发 tag；官网仓一条合并流程 + CI 提醒 |
| 文档站的 canonical 与 hreflang 不一致 | 迁到独立域前先修 `seo()` 的 canonical（去掉无语言前缀），并更新 `tests/unit/content-head.test.ts:108` |
| 文档独立成域后 `/` 无落地页 | 加 `index.md` 或让 `/` 重定向到 `getting-started` |
| 派生模板仓时误删通用代码 | 推之前在模板仓跑全量 `pnpm check` + `pnpm test` + `pnpm test:e2e` |
| 模板仓的 CI 缺 `.env` 导致 e2e 全红 | 沿用现仓 CI 的做法：`cp .env.example .env` + 追加合成 mail key；`wrangler.jsonc` 的 `vars.NODE_ENV=production` 是这条存在的原因 |

## 测试接缝

按「能测的最高点」原则，只新增**一个**主要接缝：

**init 的计划生成**（`plan.ts` 是纯函数）。给定一份配置 + 一份文件树，产出变更计划；
单测断言计划的文件清单与逐条变更。这样替换表的正确性、幂等性、`.env` 合并行为都在这一
层被覆盖，不需要真的落盘。

落盘层（`apply.ts`）只保留一个**冒烟测试**：在临时目录上跑一次完整 init，断言目标文件
内容正确、`.env` 注释保留、git 仓库已初始化。

其余沿用现有接缝，不新增：

- `tests/unit/brand-config.test.ts`、`tests/unit/seo.test.ts`、`tests/unit/home-head.test.ts`、
  `tests/unit/llms.test.ts`、`tests/components/landing.test.tsx`、
  `tests/components/navigation.test.tsx`、`tests/components/legal-docs-render.test.tsx`
  —— 这 7 个文件是**硬编码品牌断言**，init 跑完后必须全绿，它们就是替换表的验收清单。
- `tests/unit/content-head.test.ts` —— canonical 修复的守门人。
- `pnpm check` / `pnpm test` / `pnpm test:e2e` —— 模板仓与官网仓各自的全量门禁。

## 实施顺序

1. **当前仓内按 TDD 实现 init 脚本**（`scripts/init/**` + `tests/unit/init-*.test.ts`）。
   放在当前仓是因为这里有完整测试基建；脚本稳定后再整体搬进模板仓。
   1. `plan.ts` / `apply.ts` / `replacements.ts` / `env-merge.ts` / `questions.ts`
   2. 替换表 + 反向清单单测
   3. `.env` 合并单测（注释与未托管 key 保留）
   4. 临时目录冒烟测试
2. **修 `setup.ts` 的三处缺陷**（`.env` 覆盖、`wrangler.jsonc` 注释、R2 默认启用）。
3. **补全 `.env.example`**，并修 `service-status.ts:141` 的 payment 假阳性。
4. **拆 logo**：wordmark 与图形分开，`BrandLogo` 走 `metadata.name`，
   接上 `metadata.images.logoLight/logoDark`。
5. **泛化商业痕迹**：`isTemplatePriceValid` → 一次性商品校验；`template` product 改为由
   init 参数生成；`checkout-client.ts` 与 `api/payment/$.ts` 的 template 分支泛化。
6. **通用化文档**：22 个技术 slug 去品牌（改占位符写法，不用 `{{EMAIL_*}}`）；
   legal 骨架与官网填好版分离；删 blog / changelog 示例内容。
7. **修 canonical 与 `/` 落地页**（顺带的两个缺陷）。
8. **派生模板仓**：`template` 分支 → 推到 `Woods30/saas-template` → 全量验证。
9. **现仓改名** `Woods30/jerbix`，加 `template` remote，跑第一次合并。
10. **模板仓的文档站部署**（独立域 + 模块开关）。
11. **官网仓跟进**：移出 `/docs`、改冒烟测试、`kvTitle` 改配置读。

## 留给实施者

- 替换表的具体条目与文案措辞
- 占位符的具体写法（`<your-domain>` 之类）与文档中的表述
- 模板仓的 CI 与文档站部署的具体配置
- 商业条款文档的内容
- 官网仓与模板仓的版本号关系（tag 与 `package.json` version 的对应）
