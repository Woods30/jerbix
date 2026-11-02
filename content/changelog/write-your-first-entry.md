---
title: Write your first entry
description: How the changelog module reads entries, and the frontmatter fields it needs
date: 2026-11-02T00:00:00.000Z
summary: The changelog is a single page listing every entry, newest first
locale: en
---

# Write your first entry

Changelog entries live in `content/changelog/`, one Markdown file per release. Unlike
the blog, there is no per-entry page: every entry is rendered on the single changelog
page, newest first.

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | The release title, shown as the entry headline |
| `date` | yes | ISO timestamp; entries are ordered by it, newest first |
| `summary` | yes | One line, shown under the title |
| `locale` | no | `en` or `zh`; the file name suffix decides it when omitted |

The file name is not part of the URL, but keep it sortable anyway — `2026-11-02-release.md`
reads better than `release-2.md` in a directory listing.

## Body

The body is a Markdown bullet list, one line per change. Group the lines under a
heading when a release has several themes.

Delete this file once you have written your own entry — it is here to show the format,
not to be published as-is.
