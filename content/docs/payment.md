---
title: Payment
description: Flat product configuration, hosted checkout, and billing management
locale: en
order: 14
group: features
updated: 2026-11-03
---

Select one provider for the site through `websiteConfig.payment.provider`. Stripe and Creem are implemented; customers do not choose a provider during checkout. Switching providers only changes `VITE_PAYMENT_PROVIDER` (or the default in `src/config/website.ts`); pages, subscriptions, and persistence stay shared.

## Products and prices

Define each product once in `src/config/products.ts`, inside `getProducts()`:

```ts
{
  id: 'pro',
  name: m.pricing_pro_name(),
  description: m.pricing_pro_description(),
  features: [m.pricing_pro_feature_1()],
  recommended: true,
  prices: { monthly: 'pro_monthly', yearly: 'pro_yearly' },
}
```

Keys in `prices` are application offer IDs. Values are sales references interpreted by the selected provider: Stripe uses Price lookup keys; Creem uses the same reference and resolves it to a `prod_*` ID through `CREEM_PRODUCTS`. Create separate Stripe Products for different plans, with multiple Prices for billing variants. Creem has no lookup key — the product is the price — so each billing variant needs its own recurring product. Amounts, currency, and actual billing intervals come from the provider and are cached for 10 minutes. An offer ID does not determine its billing interval.

Empty `prices` means free; its button opens registration or the dashboard. `recommended` is optional. Array order controls display order. No CTA, tier, or exclusivity configuration is required. Evaluate translated copy inside the function, never at module initialization.

Configuration diagnostics reject duplicate product IDs, duplicate references, and empty references. Missing prices disable purchasing instead of sending customers to registration. Cache keys include the provider and references. Stripe price changes can transfer the existing lookup key to a new Price.

## Purchase rules

The client submits only `productId` and `offerId`. The server authenticates, rate limits, checks same-origin return URLs, resolves the real price, and creates hosted Checkout. Login returns customers to pricing with their selection restored; checkout requires another explicit click.

Each account can have at most one non-terminal subscription. `active`, `trialing`, `past_due`, `unpaid`, `paused`, and `incomplete` occupy the slot. A subscription scheduled to cancel still occupies it until termination. `canceled` and `incomplete_expired` allow another purchase. Existing subscribers are directed to billing management.

A persistent reservation and stable idempotency key reuse an unfinished subscription Checkout across concurrent requests. The same offer reuses that session. A different offer returns an explicit conflict; continue the original offer or wait for expiration. Historical subscription events cannot release a newer reservation. Before releasing a reservation, the server checks the provider session and synchronizes any completed subscription; repurchase requires a terminal subscription. Local expiration alone cannot establish that no payment occurred. Provider errors retain the reservation. A lost creation response is recovered with the original request, idempotency key, and fixed expiration time.

Independent one-time products may be purchased separately and repeatedly. They never cancel or supersede subscriptions.

## Billing and management

`/dashboard/billing` shows the current subscription, price and interval, status, renewal/end date, historical subscriptions, and payment records. Partial refunds retain and display the original payment amount and cumulative refunded amount.

The server resolves the customer ID from authenticated subscription or payment ownership. One-time-only customers can also access the hosted portal. Clients cannot supply another customer's ID.

Cancellation, payment methods, and invoices use the provider portal. There is no application-owned switching, proration, scheduled downgrade, or lifetime takeover. Stripe Portal may offer plan changes when configured in the provider dashboard. Webhooks synchronize the actual price. Portal capabilities differ across providers.

## Webhooks

The endpoint is `/api/webhooks/stripe`. Add it under Stripe Dashboard → Developers → Webhooks and tick these events — **missing one means that record never gets written**:

| Event | Purpose |
|---|---|
| `checkout.session.completed` | Checkout context for one-time payments |
| `checkout.session.async_payment_succeeded` | Actual settlement for delayed payment methods |
| `customer.subscription.created` / `updated` / `deleted` | Subscription lifecycle |
| `invoice.paid` | **The authoritative payment-success event** |
| `invoice.payment_failed` | Failed payment, never grants access |
| `charge.refunded` | Refunds |

`invoice.paid` is the authoritative payment-success event. Stripe does not guarantee delivery order, and an endpoint may deliver only `invoice.*` events, so payment records must not depend on `checkout.session.completed` alone: one-time payments also create an invoice, with ownership written into `invoice.metadata` so a standalone invoice event can still locate the user. Both paths use the same PaymentIntent as the external ID, so a payment seen twice is written once.

The route preserves the raw body and verifies its signature asynchronously. The adapter produces a provider-neutral `PaymentEvent`; `src/payment/events.ts` persists it. Unpaid asynchronous sessions do not fulfill purchases. Subscription and invoice events retrieve the latest subscription state to resist out-of-order delivery. The success page never grants access.

Provider-scoped event IDs deduplicate processing; business transaction IDs independently prevent duplicate payments. Failures return 500 for retries. Refunds that arrive before the payment is synchronized also retry. Partial refunds do not mark the full payment refunded. Multiple invoice payments are recorded separately with their actual amounts and refund references. Subscription snapshots use version-checked writes and re-fetch provider state after a conflict. Successful payments retain operational notifications when enabled.

The return page displays a notice without emitting revenue analytics from its query parameters; revenue tracking should use verified transactions.

## Another provider

Implement `PaymentProvider` in `src/payment/types.ts`, register the adapter, add environment validation, and expose its webhook route. The adapter interprets sales references and normalizes catalog prices, subscription snapshots, and events; pages and persistence stay shared.

## Creem

Creem is a Merchant of Record: it collects in its own name and handles tax and refunds, so the site receives net settlements. Both subscriptions and one-time payments are supported.

### Configuration

1. Create products in the Creem dashboard: recurring products for subscriptions (one per interval) and one-time products for lifetime purchases.
2. Map product IDs through environment variables, with the reference from `src/config/products.ts` on the left:

   ```dotenv
   VITE_PAYMENT_PROVIDER=creem
   CREEM_API_KEY=creem_xxx
   CREEM_WEBHOOK_SECRET=whsec_xxx
   CREEM_PRODUCTS=pro_monthly=prod_xxx,pro_yearly=prod_yyy,lifetime=prod_zzz
   ```

3. Set `CREEM_DEBUG=true` to target the sandbox (`test-api.creem.io`) while developing; use sandbox keys and products there. Switch back to `false` with production keys before launch.

### Webhooks

The endpoint is `/api/webhooks/creem`. Add it in the Creem dashboard; the signing secret is `CREEM_WEBHOOK_SECRET`. The `creem-signature` header is the HMAC-SHA256 hex digest of the raw body, compared in constant time. An invalid signature returns 400.

Key events:

| Event | Purpose |
|---|---|
| `checkout.completed` | Checkout finished; one-time orders are recorded here |
| `subscription.paid` | **The authoritative subscription payment event**, sent for the first payment and every renewal |
| `subscription.*` | Subscription lifecycle; `scheduled_cancel` normalizes to active with `cancelAtPeriodEnd` |

Ownership travels in checkout `metadata.userId` / `productId` / `offerId`; subscription metadata wins when present. If both are missing, persistence throws so Creem retries until an event carrying ownership arrives — a payment is never attributed to a guessed user.

### Differences from Stripe

- **The product is the price**: there is no lookup key; checkout takes `product_id`, and the catalog fetches each product with `GET /v1/products/{id}`.
- **No cancel_url**: cancellation returns to Creem's own page; the site has no cancellation redirect.
- **Amounts are pre-tax**: the checkout page adds tax, so the displayed price can differ from the charged total. Tax is Creem's responsibility under MoR.
- **Status mapping**: `expired` becomes `past_due` (still recoverable); unknown statuses become `incomplete` so access is withheld rather than assumed.
- **No in-app refunds**: refunds happen in the Creem dashboard and sync back through events.

Existing subscriptions do not migrate when you switch providers; changing providers changes the merchant of record, so handle the backlog yourself.

## Schema changes

Review `0008_payment_simplification.sql` before applying it. It removes switching-specific fields and adds Checkout reservations. Production application requires separate authorization. No historical payment conversion or automatic database reset is provided. New instances should apply all migrations to an empty database; compatibility with existing production payment data is outside this refactor.
