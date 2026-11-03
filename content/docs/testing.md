---
title: Testing
description: The three test layers, common commands, and when to add an E2E
locale: en
order: 25
group: develop
updated: 2026-11-03
---

**E2E only guards "can a user complete a task"; detailed interactions belong in component
tests.** This page covers the split and what to ask before adding a case.

## The three layers

| Layer | Scope | Location | How to run |
|---|---|---|---|
| Unit | Pure logic: module gates, theme parsing, locale normalization, env validation, email templates | `tests/unit/` | `vitest run --project unit` |
| Component | Single page or component interactions: form validation, menu toggles, breakpoint layout, copy | `tests/components/` | `vitest run --project components` (jsdom) |
| E2E | Cross-page, cross-service journeys: sign-up and sign-in, account center reads and writes, module gates, key pages reachable | `e2e/` | `pnpm test:e2e` (Playwright) |

There is also `tests/workers/`, which runs on the Cloudflare Workers runtime. Run it with
`pnpm test:workers`; it is not part of `pnpm test`.

## What belongs in E2E

Ask these two questions before adding a case:

1. **"Which core flow does this guard?"** If you cannot answer, push it down to a component
   test.
2. **"Does it really need a real browser, real server, and real database?"** Element
   positions, overflow at breakpoints, animation toggles, hover offsets, anchor scrolling,
   TOC structure, single-field validation messages, and static file contents (sitemap /
   robots / manifest) are covered by component tests or build-time assertions at an order of
   magnitude lower cost.

Keep each spec under 10 cases and the whole suite under five minutes. Cross-locale behavior
is covered by unit tests; E2E runs the main flow in **one** locale only.

## Commands

| Command | Purpose |
|---|---|
| `pnpm test` | All unit and component tests |
| `pnpm test:affected` | Only affected tests |
| `pnpm test:watch` | Watch mode |
| `pnpm test:workers` | Workers runtime tests |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm test:e2e:ui` | Playwright UI mode |
| `pnpm exec vitest run --project unit` | Unit tests only |
| `pnpm exec vitest run --project components` | Component tests only (jsdom) |

`pnpm test` runs `locale:compile` first and can stall on an interactive prompt in
non-interactive environments — in CI, run the projects separately.

E2E starts a dedicated test server. If port 3000 is occupied, use a separate port:

```bash
E2E_BASE_URL=http://localhost:3107 pnpm test:e2e
```

## Two traps

- **Wait for hydration before clicking.** A click before hydration finishes fails silently
  — no error, no navigation, indistinguishable from a product bug.
- **Add randomness to concurrent sign-up emails.** `Date.now()` alone collides under
  `fullyParallel`.

See [Project Structure](./project-structure) for where test files live and how module
switches are pinned; [Form Conventions](./forms) covers the component tests around forms.
