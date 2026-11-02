---
title: Documentation
description: How to use the template — getting started, configuration, deployment, and each module
locale: en
order: 0
updated: 2026-11-02
---

This documentation describes a deployable SaaS starter: a TanStack Start application on the
Cloudflare Workers runtime, plus auth, payments, email, and other modules that are switched on
or off. The docs ship with the code, so they never drift from the implementation.

## Where to start

- [Getting Started](./getting-started) — one line from clone to production, including
  `pnpm run init`.
- [Configuration](./configuration) — site name, logo, and module switches live in one file.
- [Environment](./environment) — the two-layer env model and who owns each variable.
- [Cloudflare](./cloudflare) — domains, secrets, variables, and automated deploys.

## Map of the docs

| Group | Covers |
|---|---|
| Start | From clone to a running site |
| Config | Site configuration, navigation, and environment variables |
| Deploy | Cloudflare, D1, storage, and cache |
| Features | Integrations, auth, email, newsletter, payments, notifications, analytics, API keys, and user management |
| Develop | Project structure, design system, forms, and testing |

## Conventions

- Commands always start with `pnpm`; the scripts live in `package.json`.
- Configuration files keep stable locations: `src/config/website.ts` (site config),
  `src/config/products.ts` (pricing plans), `wrangler.jsonc` (deployment and bindings), and
  `.env` (local environment variables).
- Amounts live only in the provider's price catalog — the code never keeps a second copy.
