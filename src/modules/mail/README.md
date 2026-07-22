# Mail module (`/mail`) — standalone email web client

A self-contained email client shell you can build out **in isolation**, in a
separate Claude Code session, without touching the rest of the app or the
backend.

## What's here (the scaffold)

| File | Role |
|---|---|
| `types.ts` | Domain types (`MailMessage`, `MailFolderId`, `MailAddress`, …). The contract — keep these stable when you add a backend. |
| `store.ts` | Local-first **zustand** store (persisted to `localStorage` key `aiba-mail`), **seeded with mock messages** so `/mail` works with zero backend. Folders list + unread helper live here too. |
| `page.tsx` | `MailPage` — the three-pane client (folder rail · message list · reading pane). Open folder + message live in the URL (`?folder=&msg=`). |
| `compose.tsx` | `ComposeDialog` — minimal To / Subject / Body + Send (appends to `sent`). |

## How to run it

Nothing special — it's part of the SPA. `npm run dev` (or the running dev
server on `:5181`) → open **`/mail`**. It renders immediately from the mock
store. To reset the mailbox: clear `localStorage["aiba-mail"]`.

## Isolation — what this module may touch

- ✅ Everything inside `src/modules/mail/`.
- ✅ Shared UI primitives: `@/components/ui/*`, `@/shared/lib/utils`,
  `@/shared/hooks/use-url-state`, `lucide-react`, `zustand`, `react-i18next`.
- ⛔️ Do **not** edit other modules or the backend from the parallel session.
- The three shared touch-points were wired **once** by the setup and you
  shouldn't need to change them again:
  - `src/app/layout/tab-routes.tsx` — lazy import + `<Route path="/mail">`.
  - `src/app/layout/nav-config.ts` — the nav entry (icon + `/mail`).
  - `src/shared/i18n/{uz,uz_Cyrl,ru,en}.ts` — `nav.mail` + a `modules.mail.*`
    namespace. **Add new UI strings here** (all four locales) as you build;
    every string in the code already passes a `defaultValue` so it renders
    untranslated until you add the key.

## Conventions (match the rest of the app)

- React + TS (strict, no `any`), Tailwind + shadcn/ui, `cn()` for class-merge.
- All page/filter state in the URL via `useUrlState` (so tabs/refresh/deep-link
  work) — see `page.tsx`.
- i18n via `t("modules.mail.<key>", { defaultValue })`.

## Extending it — suggested next steps

1. **Backend**: when ready, add a Rust module in `next/backend`
   (`crates/api/src/modules/mail.rs` + routes) or connect to an IMAP/JMAP/SMTP
   gateway. Then replace the seed + mutating actions in `store.ts` with
   TanStack Query hooks in a new `api.ts` (mirror `modules/calendar/api.ts`),
   keeping the same shapes so `page.tsx` barely changes.
2. **Rich body**: swap the plain-text `body` for sanitized HTML (add a
   sanitizer; render in an isolated container).
3. **Threads/conversations**: group messages by `subject`/`References`.
4. **Attachments**: real upload/download (S3/MinIO like the messenger).
5. **Labels, search, filters, signatures, multiple accounts** — the types
   already leave room (`labelIds`, `cc`, `MailLabel`).
6. **Guide**: add `docs/pages/*.md` (4 locales) like other modules so it shows
   in `/guide`.

## Notes

- `store.ts` avoids `Date.now()` in the seed for deterministic reloads; sent/
  draft messages get a placeholder date — stamp a real timestamp in the page
  layer (or once the backend assigns it).
- The module is intentionally dependency-light so the parallel session has a
  clean, conflict-free surface.
