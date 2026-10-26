@AGENTS.md

# Finance Tracker — project context

Personal-finance PWA for Indian users (all money is **INR**, formatted with `formatCurrency` from `lib/utils.ts`, `en-IN` locale). One developer (GitHub `vipulanand2002`, commits as `Vipul2002`), deployed on **Vercel**, backed by **Supabase** (Postgres + Auth + Storage + Realtime). No test suite.

Features: transactions (income/expense, receipts, recurring), budgets, credit/debit cards with statement import (PDF upload or Gmail), wallets & accounts (Amazon Pay, MobiKwik, Paytm, bank, cash…) with balances and transfers, trips (members, invitations, budgets, chat), Splitwise-style splits, cross-person balances and settlements, friends with DMs, push notifications, reminder emails, Gemini-powered AI chat/insights/receipt scanning, a public `/demo` with mock data, and an Android share target for UPI SMS.

## Stack

- **Next.js 16.2 (App Router, Turbopack) + React 19.2**. Per `AGENTS.md`, check `node_modules/next/dist/docs/` before using Next APIs. Notable 16.x conventions already used here:
  - Middleware lives in **`proxy.ts`** exporting `proxy()` (the old `middleware.ts` name is gone). It refreshes the Supabase session and redirects: logged-out → `/login` (except `/login`, `/signup`, `/demo`); logged-in on auth pages → `/dashboard`.
  - `cookies()` is async (`await cookies()`).
- TypeScript strict, path alias `@/*` → repo root.
- Tailwind CSS v4 (config in `app/globals.css`, no tailwind.config), shadcn/ui **style `base-nova` built on `@base-ui/react`** (not Radix) in `components/ui/`, `lucide-react` icons, `sonner` toasts, `next-themes` (class-based dark mode), `recharts`, `date-fns`, `@dnd-kit` (nav reordering).
- Supabase via `@supabase/ssr`; Gemini via `@google/genai`; email via `nodemailer` → Brevo SMTP; push via `web-push` (VAPID); PDF text via `pdf-parse` (marked `serverExternalPackages`).
- Installed but **currently unused**: `resend`, `pdfjs-dist`, `pdf-lib`, `xlsx`, `@ducanh2912/next-pwa` (service worker is hand-written in `public/sw.js`), `react-hook-form`, `@hookform/resolvers`, `zod`, `cn`.

## Commands

```
npm run dev      # next dev
npm run build
npm run lint     # eslint (flat config: next core-web-vitals + typescript)
npx tsc --noEmit # type-check (no npm script for it)
```

Baseline (Oct 2026): `tsc` passes clean. `eslint` reports **51 errors / 24 warnings**, mostly pre-existing `react-hooks/set-state-in-effect` (30) and `no-explicit-any` (16). Don't treat those as regressions; don't introduce new ones.

## Layout

```
app/
  (auth)/login, signup           client pages, demo teaser in layout
  (dashboard)/                   layout.tsx = server auth check → DashboardShell
    dashboard transactions cards wallets trips budgets splits balances friends ai share
    settings/{profile,security,navigation}   hub driven by lib/settings-sections.ts
    contacts/                    redirect only (contacts live under Friends)
  api/<resource>/route.ts        all data access — see "API conventions"
  auth/callback/route.ts         Supabase OAuth/email callback
  demo/page.tsx                  public, self-contained mock data (no API calls)
components/<feature>/            big client components (modals, sheets, lists)
components/ui/                   shadcn primitives — prefer these over new widgets
lib/
  supabase/{client,server,service}.ts   browser / cookie-bound server / service-role
  settlement-history.ts, close-balance.ts  pure balance & settlement logic
  ai.ts                          Gemini wrapper (model fallback + retry)
  constants.ts                   category lists + CATEGORY_COLORS
  nav-items.ts, use-nav-order.ts sidebar items + per-user order
  email-templates/*.ts           HTML builders for reminder/summary emails
  wallet-providers.ts            wallet/account provider list + computeBalances
  parse-upi.ts                   regex parser for bank/UPI SMS (share target)
  push.ts                        sendPushToUser (service role, prunes 410s)
types/index.ts                   shared row types (partial — many files define local interfaces)
supabase/migrations/001…046      schema history, applied manually
public/sw.js, sw-push.js, manifest.json   PWA (share_target → POST /share)
```

Largest/most intricate files: `components/trips/TripDetailSheet.tsx` (~1.8k lines), `components/transactions/TransactionModal.tsx` (~1.2k), `app/(dashboard)/friends/page.tsx`, `cards/page.tsx`, `components/cards/CardPDFImport.tsx`, `components/splits/SplitModal.tsx`, `app/(dashboard)/splits/page.tsx`, `balances/page.tsx`. Read the relevant region before editing; they hold a lot of inline domain logic.

## Patterns to follow

- **Pages are client components** (`'use client'`) that `fetch('/api/...')` and keep state in `useState`/`useCallback` loaders. There is no React Query / SWR / server actions. Heavy modals and sheets are loaded with `next/dynamic(..., { ssr: false })`.
- **API routes**: each starts with a local `getUser()` that builds the cookie-bound server client and returns 401 if there's no user. Scope every query with `.eq('user_id', user.id)` / `.eq('created_by', user.id)` even though RLS also applies. Query-string params select the operation (e.g. `PATCH /api/splits?type=participant|settle|settle_many|close_balance|update`, `?id=`). Errors return `{ error: message }` with 4xx/5xx.
- **Service-role client** (`SUPABASE_SERVICE_ROLE_KEY`) is used only for cross-account work: resolving emails → profiles, on-behalf transactions, posting split chat messages, cascades, crons. Several routes create it inline with `createClient(url, serviceKey)` instead of `lib/supabase/service.ts` — either is fine, but keep it server-only and keep writes scoped to rows the caller owns.
- **Graceful degradation for un-applied migrations** is a deliberate convention: probe a column/table, or catch the error and retry without the new column (see `/api/transactions` contact columns, `paid_by` in splits, `/api/settlements` returning `{ available: false }`). Keep doing this when adding columns, since migrations are applied by hand.
- Emails are compared **lowercased** everywhere; store them lowercased.
- Commit messages: `Area: imperative summary of the behaviour change` (e.g. `Balances: add a Settled tab…`, `Fix Close Balance: …`).
- **Ship every change**: the owner wants each finished change committed, pushed to `master` and deployed without asking first (standing instruction, Oct 2026). Before pushing, `git fetch` and fast-forward — other sessions/devices push to `master` too, so never force-push. Pushing deploys the web app on Vercel; pushes touching `android/` also build a new APK release via GitHub Actions. If a database migration is needed, say so — it still has to be run by hand in Supabase.

## Domain model (read before touching money logic)

**People.** Three kinds of counterparty, and code must handle all three:
1. *Registered user* — has a `profiles` row (id = auth user id, `email`, `full_name`, `avatar_url`, `avatar_public`). Profiles are world-readable (friend search).
2. *Email-only contact* — `contacts` row with an email but no account.
3. *Name-only contact* — no email at all. In tables with NOT NULL email columns (`trip_invitations`, `trip_members`) these use a placeholder `_nomail_<random>@local`; strip it for display (`startsWith('_nomail_')`).

`contacts` (per-user address book: name, email, notes) is the user's view of people; `friendships` (mirrored both directions by trigger) + `friend_requests` connect registered users for chat (`messages`). `GET /api/friends` returns contacts enriched with connection status. Prefer a person's own `profiles.full_name` over the nickname someone typed (`lib/profile-names.ts`).

**Person key.** Balances, settlements and history identify a person as `e:<lowercased email>` or, with no email, `n:<lowercased name>`. `settlements.person_key` stores this.

**Contact edits cascade.** Changing a contact's name/email (`PUT /api/friends`) runs `backfillAllReferences` in `app/api/friends/route.ts`, which rewrites every denormalised copy the user owns: `split_participants`, `expense_splits.paid_by/paid_by_email/paid_by_name`, `settlements.person_key`, on-behalf `transactions.user_id`, `tagged_payments`, `trip_invitations`, `trip_members`, `trip_personal_budgets`, `split_notifications`. Any new table that stores a person's email/name must be added there.

**Transactions** (`transactions`): `amount > 0`, `type` income|expense, category from `lib/constants.ts` or `user_categories`. Links: `trip_id`, `card_id`, `split_id` (auto-created for a split), `contact_id` + `contact_ids[]` (tagged people), `is_discrete` (hidden from trip members/totals), `created_by` (set when someone else authored it on your behalf — only the author may edit/delete, via `/api/on-behalf`).
- Tagging a transaction to a registered contact mirrors it into `tagged_payments` for them: income → `kind 'payment'` (they paid you), expense → `kind 'charge'` (you paid for them). Re-synced on every edit.
- Card-related rows (`card_id` set, or category `Card Payment`) can be excluded from totals (`exclude_card=true`, `useCardToggle`).

**Splits** (`expense_splits` + `split_participants`): one row per participant with `amount_owed`, `is_paid`, `paid_at`.
- **Creditor** = `paid_by` if set, else (if `paid_by_email`/`paid_by_name` set) an *unregistered* payer, else `created_by`. `created_by` is the author with edit rights; it is not necessarily who paid. Legacy rows have `paid_by` NULL → treat as `created_by`.
- Creating a standalone split also inserts the creator's expense transaction (linked by `split_id`); creating one from an existing transaction just links it. Deleting a split deletes its linked transactions.
- Only the payer's own share is auto-marked paid. On edit, paid participant rows are preserved and only unpaid rows are replaced.
- On creation, participants with emails get `split_notifications`, a push, and (if friends) a `messages` row of `type 'split'`.

**On-behalf expenses** (`POST /api/on-behalf`): log an expense a friend paid. Registered friend → a transaction in *their* account (`user_id` = friend, `created_by` = me) plus an optional split with `paid_by` = friend. Unregistered contact → split only, with `paid_by_email`/`paid_by_name`.

**Balances** (`app/(dashboard)/balances/page.tsx`, client-side): per person, net = split shares owed between the pair + tagged items. Positive = they owe you. Use the pure helpers in `lib/settlement-history.ts` and `lib/close-balance.ts`; don't re-derive.
- **Only shares between the user and that person count.** A bill paid by a third person is never part of the pair.
- **Settling is an agreement, not a payment.** "Close Balance" (`PATCH /api/splits?type=close_balance`) marks the pair's unpaid shares paid, settles splits that become fully paid, and writes a `settlements` row. It must **never** create income/expense transactions. Activity recorded before `settled_at` belongs to the closed round.
- Settlement history = recorded `settlements` rows + rounds derived from timestamps for older data (`buildPersonHistory`).
- The same rules feed the Friends tab, the balance detail sheet and reminder emails (`/api/mail/reminder`); keep them consistent.

**Wallets & accounts** (`/wallets`, migration 046): `accounts` rows (kind wallet|bank|cash|other, `provider` key from `lib/wallet-providers.ts` — never rename keys, `opening_balance`, `is_archived`). A transaction links to one via `transactions.account_id`; card and account are mutually exclusive in `TransactionModal`. `account_transfers` records top-ups (only `to_account_id`), withdrawals (only `from_account_id`) and moves between accounts — these change balances but are **never** income or expenses. Balance = opening + income − expenses + transfers in − transfers out, computed by `computeBalances` in `GET /api/accounts` (returns `{ available, accounts }`; `available: false` before the migration).

**Trips**: owner in `trips.user_id`. Membership source of truth is `trip_invitations` (friends / no-account / name-only → `accepted` immediately; registered non-friends → `pending`). Accepting copies the person into `trip_members` by trigger. `is_trip_member()` (SECURITY DEFINER, by `auth.email()`) grants read access to trip, members, budgets and non-discrete transactions. Also: `trip_budgets` (per category), `trip_personal_budgets` (`is_private`), `trip_messages` (realtime chat), `budget_visible_to_members`, `is_closed`. "Temporary members" in the trip view are name-only people who appear in splits but aren't members.

**Cards**: `cards` (stores `pdf_password` and `statement_sender_email`), `card_budgets`, `card_statements` (imported cycles). Statements come in via PDF upload (`/api/pdf`: pdf-parse → chunked text → Gemini) or Gmail (`/api/auth/gmail` OAuth → tokens in `user_gmail_tokens` → `/api/gmail/fetch-statement` sends the PDF bytes to Gemini).

**AI** (`lib/ai.ts`): `geminiText` / `geminiVision` try `GEMINI_MODEL` (default `gemini-flash-lite-latest`), then `GEMINI_FALLBACK_MODEL`, retrying 429/5xx once. Prompts ask for JSON; strip ``` fences with `cleanJson`. AI routes set `maxDuration = 30`.

**Notifications**: `notifications` (generic, realtime), `split_notifications`, `trip_invitations` and `friend_requests` all feed `components/layout/NotificationBell.tsx` / `TripInvitationNotifier` via Supabase Realtime. Web push subscriptions live in `push_subscriptions`.

**Nav order** is saved in Supabase `user_metadata.nav_order` (array of hrefs) and cached in localStorage `nav_order_v1`. `href` is the stable key; new pages are appended automatically (`orderNavItems`).

## Database & migrations

- Migrations are numbered SQL files in `supabase/migrations/` and are **applied manually** in the Supabase SQL editor (project ref `ddosukwtdahscyakmhfu`). New migration = next number, idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`), with RLS enabled and policies in the same file.
- RLS is on for every table. Cross-table policies use SECURITY DEFINER helpers (`is_split_creator`, `is_split_participant`, `is_trip_member`) to avoid recursion — reuse them.
- `delete_user_completely(uuid)` is an admin helper; add new per-user tables to it.
- **Schema drift — these exist in production but have no migration in the repo**: the `contacts` table itself, `expense_splits.card_id`, `cards.statement_day`, `card_statements.imported_at` (the migration only defines `created_at`), and the `split-docs` storage bucket. Don't assume the migrations folder alone can rebuild the DB.
- Storage buckets: `receipts` (private, `<uid>/…` folders), `trip-images` (public), `avatars` (public, `<uid>/…`), `split-docs`.

## Environment variables

`.env*` is gitignored; values live in Vercel. The code reads:

| Var | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all Supabase clients |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role client (server only) |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | `lib/ai.ts` |
| `BREVO_SMTP_USER`, `BREVO_SMTP_KEY`, `BREVO_FROM_EMAIL` | reminder / summary emails |
| `NEXT_PUBLIC_APP_URL` | links in emails, Gmail OAuth redirect |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Gmail OAuth |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | web push |
| `CRON_SECRET` | `Authorization: Bearer` on crons and `/api/push/send` |

Vercel crons (`vercel.json`): `/api/cron/recurring` on the 1st of each month (copies last month's `is_recurring` transactions) and `/api/cron/statement-reminders` daily at 14:30 UTC (pushes "statement ready" within 5 days of `cards.statement_day`, IST-based).

## Working on the Android (VSCodroid) device

This repo is also edited on an Android phone running VSCodroid. There, Android blocks executing scripts from app storage, which has these effects:
- `npm run <script>` and `node_modules/.bin/*` fail with `bad interpreter: Permission denied`. Call the JS entry directly instead, e.g. `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js .`.
- `next dev` starts but can't compile: there is no SWC binary for android-arm64 and Next can't download the WASM fallback. `sharp` also fails to load. Treat the device as edit / type-check / lint / commit only; run the app on Vercel previews or a desktop.
- Git uses SSH (`git@github.com:vipulanand2002/finance-tracker.git`). HTTPS login via VS Code's askpass helper doesn't work on this device.
- The `grep` shell function is broken there; use `rg`.
