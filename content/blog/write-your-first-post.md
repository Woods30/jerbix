---
title: Write your first post
description: How the blog module reads posts, and the frontmatter fields it needs
date: 2026-11-02T00:00:00.000Z
published: true
locale: en
---

# Write your first post

Blog posts live in `content/blog/`, one Markdown file per post. The file name is the
post's URL segment, so `content/blog/hello.md` is served at `/marketing/blog/hello`.

A post needs a title, a description and a date. Everything else has a default:

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | The post title, shown in the list and on the page |
| `description` | yes | One line, used in the list and in `<meta name="description">` |
| `date` | yes | ISO timestamp; the list is ordered by it, newest first |
| `published` | no | `false` keeps the post out of the list, the sitemap and `llms.txt` |
| `locale` | no | `en` or `zh`; the file name suffix decides it when omitted |
| `tags` | no | Free-form labels, currently only used by your own templates |
| `image` | no | Absolute URL of the cover image |

## Two languages, one file name

Translations share the file name and differ by suffix: `hello.md` is English and
`hello.zh.md` is Chinese. The URL does not carry the language — the language is
negotiated per request, so the same address shows the right translation and a
missing translation falls back instead of returning a 404.

## Body

The body is Markdown, rendered with the components in `src/components/mdx/`. Headings
get stable anchor ids, so links such as `#configuration` keep working.

Delete this file once you have written your own post — it is here to show the format,
not to be published as-is.
