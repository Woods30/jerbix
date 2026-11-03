---
title: Analytics
description: Enabling tracking scripts, CSP allowlists, and business events
locale: en
order: 21
group: analytics
updated: 2026-11-03
---

The analytics module injects tracking scripts in production builds and reports page views plus
business events. You can enable several providers at once; each one reports independently.

## Steps

1. **Pick the providers.** In `src/config/website.ts`:

   ```ts
   analytics: { enabled: true, providers: ['ga', 'plausible'] },
   ```

   `providers` is an array, so several can be listed together.

2. **Set the environment variables.** These are `VITE_` public variables and end up in the client
   bundle:

   | Provider | Variables | Notes |
   |---|---|---|
   | `ga` | `VITE_GA_ID` | The Google Analytics Measurement ID (`G-…`) |
   | `plausible` | `VITE_PLAUSIBLE_DOMAIN` | Your site domain |
   | `umami` | `VITE_UMAMI_WEBSITE_ID` + `VITE_UMAMI_SCRIPT_URL` | The script URL must be a credential-free HTTPS URL; `VITE_UMAMI_ID` is the legacy compatible field |
   | `clarity` | `VITE_CLARITY_PROJECT_ID` | `VITE_CLARITY_ID` is the legacy compatible field |

   A selected provider without its ID is not registered and injects no script.

3. **Deploy.** `VITE_` variables are inlined into the bundle at `vite build` time, so changing one
   requires a **rebuild and redeploy**. With automatic Release deployment, set Variables of the
   same name in GitHub **Settings → Environments → production**.

## CSP allowlist

Tracking scripts are external `<script>` tags injected at runtime, which the CSP nonce cannot
cover, so `script-src` must explicitly allow the matching origins (`src/lib/security.ts`):

| Provider | `script-src` origin |
|---|---|
| `ga` | `https://www.googletagmanager.com` |
| `plausible` | `https://plausible.io` |
| `clarity` | `https://www.clarity.ms` |
| `umami` | The origin of `VITE_UMAMI_SCRIPT_URL` (self-hosted, derived per request) |

Data reporting goes through `connect-src`, which already includes GA4's `*.google-analytics.com`
and `*.analytics.google.com` — without those two, the script loads but the events never arrive.

## Business events

Event names are declared centrally in `src/lib/analytics/events.ts`. They are a contract with the
analytics platform's data structures, so call sites never use string literals.

| Event | Meaning | Status |
|---|---|---|
| `sign_up` | Sign-up succeeded | Reported by the sign-up flow |
| `login` | Sign-in succeeded | Reported by the sign-in flow |
| `begin_checkout` | The visitor clicked buy and started checkout | `trackBeginCheckout()` exists, no call site yet |
| `purchase` | The hosted checkout completed and the visitor returned to the site | `trackPurchase()` exists, no call site yet |

`begin_checkout` and `purchase` need you to call the matching reporting function from your own
checkout entry point and payment-success callback. Event parameters carry non-PII values only
(product ID, amount, currency, mode); emails and names stay out — analytics data lands on
third-party servers, and passing PII breaks both GDPR and the platform's terms of service.

## Verify

Tracking only initializes when **browser + production build + `analytics.enabled`** all hold;
development never reports, so local debugging cannot pollute real data. To check the injection
path locally, run the production artifact:

```bash
pnpm build && pnpm preview
```

Open a page and watch the Network panel for requests to the tracking domain.

## Notes

- Page views are reported once on first paint and once per route change by `AnalyticsProvider`.
- The CSP has no `unsafe-inline` / `unsafe-eval`; the nonce is the only path for inline scripts.

Once this works, see [Payment Overview](./payment) — the parameters for `begin_checkout` and
`purchase` come from the checkout flow.
