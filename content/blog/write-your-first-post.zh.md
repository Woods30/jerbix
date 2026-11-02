---
title: 写第一篇博客
description: 博客模块怎么读文章，以及需要哪些 frontmatter 字段
date: 2026-11-02T00:00:00.000Z
published: true
locale: zh
---

# 写第一篇博客

博客文章放在 `content/blog/`，一篇文章一个 Markdown 文件。文件名就是文章的 URL
路径段：`content/blog/hello.md` 对应 `/marketing/blog/hello`。

一篇文章需要标题、描述与日期，其余字段都有默认值：

| 字段 | 必填 | 含义 |
|---|---|---|
| `title` | 是 | 文章标题，列表页与正文页都用它 |
| `description` | 是 | 一句话描述，用于列表页与 `<meta name="description">` |
| `date` | 是 | ISO 时间戳；列表按它倒序排列，最新的在前 |
| `published` | 否 | `false` 时不进列表、不进 sitemap、不进 `llms.txt` |
| `locale` | 否 | `en` 或 `zh`；不写时按文件名后缀判断 |
| `tags` | 否 | 自由标签，目前只有你自己的模板会用到 |
| `image` | 否 | 封面图的绝对地址 |

## 两种语言，一个文件名

译文共用文件名、靠后缀区分：`hello.md` 是英文，`hello.zh.md` 是中文。URL 不带语言
——语言按请求协商，同一个地址会显示对应语言的译文；缺译文时回退，而不是 404。

## 正文

正文是 Markdown，用 `src/components/mdx/` 里的组件渲染。标题会生成稳定的锚点 id，
所以 `#configuration` 这样的链接不会失效。

写完自己的文章后删掉本文件——它只是格式示例，不该原样发布。
