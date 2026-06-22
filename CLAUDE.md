# CLAUDE.md

Guidance for Claude (and any AI agent) working in this repository.

## 1. Golden workflow rule — push to `main` immediately

**Every change made to this repo is committed and pushed to `main` immediately.**

- Work directly on `main`. Do **not** open feature branches or PRs unless the user
  explicitly asks for one.
- After completing any unit of work (a feature, a fix, even a docs tweak), run:
  ```bash
  git add -A
  git commit -m "<clear, descriptive message>"
  git push -u origin main
  ```
- Never leave finished work uncommitted. The remote container is ephemeral —
  anything not pushed is lost.
- Keep commits small and self-describing so the history doubles as a changelog.
- Never commit secrets (`.dev.vars`, tokens, `wrangler` auth). They belong in
  GitHub Actions secrets (see below).

## 2. Deployment — Cloudflare (you can deploy directly, don't ask)

This app deploys to **Cloudflare Workers** (API + static assets) with a **D1**
database. The Cloudflare credentials are already stored as **GitHub Actions
secrets**, so deployment is fully automated — **install and deploy directly; do
not ask the user to do it.**

Expected GitHub Actions secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token with Workers + D1 edit permissions |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID |

How deploys happen:

- Pushing to `main` triggers `.github/workflows/deploy.yml`, which installs
  deps, **bootstraps the D1 database if it doesn't exist**, applies migrations,
  and runs `wrangler deploy`. No manual steps required.
- To deploy manually from a machine that has the Cloudflare token in its env:
  `npm run deploy`.
- If you ever need the token names to differ, update both `deploy.yml` and this
  table together.

## 3. What this app is for (scope)

A personal **house & shopping assistant** web app. The #1 job is to make
household shopping fast:

- **Shopping list** — add/check off/quantity items, clear bought items after a
  shop.
- **Order history** — every past order, searchable, with prices and shop.
- **Reorder** — one tap to add any past item (or a whole past order) back onto
  the list. This is the core time-saver.
- **Wolt receipt import** — paste the copied text of a Wolt order receipt; the
  app parses items, prices, quantities, substitutions and the shop name, then
  saves the order and updates the product catalog. See
  `src/lib/woltParser.ts`.
- **Live shop finder (experimental)** — best-effort check of which Wolt shops
  currently stock the items on the list, to find where the whole/most of an
  order can be bought. See `worker/wolt.ts`.

Design principle: **save the user time**. Prefer fewer taps, smart defaults,
reorder-from-history, and bulk actions over manual entry.

## 4. Architecture

- **Frontend**: React + Vite + TypeScript (`src/`). Single-page app.
- **Backend**: Cloudflare Worker using Hono (`worker/index.ts`). Serves the API
  under `/api/*` and the static frontend for everything else.
- **Database**: Cloudflare D1 (SQLite). Schema in `migrations/`.
- **Shared types**: `src/lib/types.ts`.

### Data model (D1)
- `catalog_items` — de-duplicated products ever seen (last price/shop, order count).
- `shopping_list` — the current list.
- `orders` / `order_items` — imported receipts and their lines.

## 5. Commands

```bash
npm install            # install deps
npm run dev            # Vite dev server (frontend only, fast UI iteration)
npm run dev:worker     # full stack locally via wrangler (Worker + D1 + assets)
npm run build          # typecheck + build frontend to dist/
npm run check          # typecheck only (run before committing)
npm run deploy         # build + wrangler deploy (needs CF creds in env)
npm run db:migrate     # apply migrations to remote D1
npm run db:migrate:local  # apply migrations to local D1
```

Always run `npm run check` before committing.

## 6. Wolt notes (important & fragile)

- The receipt **parser** (`src/lib/woltParser.ts`) is pure/offline and reliable.
  If the receipt format changes, update the parser and its tests.
- The **live stock finder** (`worker/wolt.ts`) calls Wolt's private consumer API
  (`consumer-api.wolt.com`). Wolt gates this by `client-version`, rate-limits
  hard, and may change it without notice. It is **best-effort and degrades
  gracefully** — if it fails, the UI says so; it never blocks the core app.
  All Wolt request headers live in one place in `worker/wolt.ts` so they're easy
  to update when Wolt changes things.
