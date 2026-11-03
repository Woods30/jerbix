---
title: Quick Start
description: Six steps from clone to live
locale: en
order: 1
group: start
updated: 2026-11-03
---

Six steps take you from a fresh clone to a live site. Every step comes with a command, and every step leaves you with something you can look at.

## Prerequisites

| Need | Notes |
|---|---|
| Node.js 22 / 24 | `package.json` `engines` allows `^22.12.0`, `^24.0.0`, and newer |
| pnpm | Version pinned by `packageManager` in `package.json` (currently `pnpm@12.4.2`) — do not use another |
| Cloudflare account | Optional. You can run locally without one; it is needed for deploys and for creating resources |

## Steps

1. **Install dependencies.**

   ```bash
   pnpm install
   ```

2. **Make it your own project.**

   ```bash
   pnpm run init
   ```

   The script asks for a site name, a short name, a production domain, a support email, and which
   modules to enable, then rewrites in one pass: the package name in `package.json`, the brand copy
   in `messages/zh.json` and `messages/en.json`, the site name in `public/manifest.json`, the name /
   wordmark accent / support email / module and feature switches in `src/config/website.ts`, the
   one-time product name in `src/config/products.ts`, the Worker name / domain / resource names in
   `wrangler.jsonc`, and the empty `BETTER_AUTH_SECRET` and site URL in `.env`. To skip the prompts,
   pass everything at once:

   ```bash
   pnpm run init -- --name "<your-site-name>" --slug <your-slug> \
     --domain <your-domain.com> --email <your-support-email> --modules docs,auth
   ```

   `--dry-run` prints the planned changes without writing them; `--non-interactive` never asks anything.

   > The initializer **turns every module off by default** — `docs`, `blog`, `mail`, `payment` and
   > the rest stay off unless you list them in `--modules`. The template ships with them on, but
   > each one needs credentials, so a clone with nothing configured would fail production
   > validation. Turn on what you need — see [Site Configuration](./configuration).

3. **Create the Cloudflare resources and write your local env.**

   ```bash
   pnpm run setup
   ```

   How `setup` differs from `init`: `init` only touches code and copy, never the cloud; `setup`
   creates (or reuses) a D1 database and a KV namespace in your account, writes their IDs back into
   `wrangler.jsonc`, writes `CLOUDFLARE_DATABASE_ID` and `BETTER_AUTH_SECRET` into `.env`, and
   applies a local migration while it is at it. It also asks whether you want Stripe or Creem, which
   email provider, and whether to send Discord notifications — whatever you answer lands in `.env`.

   Values already present in `.env` are kept: re-running `setup` will not replace your
   `BETTER_AUTH_SECRET` or sign everyone out.

   R2 is **not** created for you — the bucket must be activated once in the Cloudflare dashboard (it
   requires a payment method, so the API cannot do it); see [File Storage](./storage) for the manual
   steps. If you are not logged in to Cloudflare the script warns and continues — local development
   uses a SQLite-backed D1 and needs no real resources:

   ```bash
   pnpm exec wrangler login
   ```

4. **Start the dev server.**

   ```bash
   pnpm dev
   ```

   Open `http://localhost:3000`. If the database was not initialized, run it by hand:

   ```bash
   pnpm run db:migrate:local
   ```

5. **Customize the site.** Name, logo, theme colors, module switches, and social links all live in
   `src/config/website.ts` — field by field in [Site Configuration](./configuration).

6. **Deploy.**

   ```bash
   pnpm deploy
   ```

   This runs production env validation → build → client bundle leak check → `wrangler deploy`.

## Verification

- Local: open `http://localhost:3000` in a browser; a rendered homepage passes.
- Live: the output of `pnpm deploy` includes the live URL (`<worker name>.<account subdomain>.workers.dev`) — if it opens, the deploy passed.

## Notes

- A secret must never carry the `VITE_` prefix: `VITE_` variables are inlined into the browser
  bundle at build time and anyone who opens the page can read them. `pnpm check:client-bundle`
  scans the build output and fails on a leak.
- Values in your local `.env` do **not** become production secrets on their own. Configure production
  values separately (GitHub production Environment or `wrangler secret put`) — see
  [Environment Variables](./environment).
- Before deploying, set `VITE_BASE_URL` in `.env.production` to a real HTTPS domain:
  `pnpm check:env:prod` rejects `localhost` and placeholder domains.

Once it is configured, continue with [Site Configuration](./configuration) and
[Deploy to Cloudflare](./cloudflare).
