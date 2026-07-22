# AIBA Next — Frontend (React + Vite)

Single-page app for AIBA Next. Superadmin tenant panel + per-tenant
module surfaces (KM, Bank, HR, etc). Talks to the Rust backend at
`/api/*` — everything else is UI.

## Ecosystem — the 3 repos

| Repo | Role | Local port |
|---|---|---|
| **next/backend** | Rust axum BFF (auth, tenant routing, cascades) | `:18001` |
| **next/frontend** *(this repo)* | React + Vite SPA | `:5181` |
| **next/bank** | FastAPI + Playwright (Ipak Yo'li) | `:8002` |

## Local dev — see backend/CLAUDE.md

The end-to-end setup guide (Postgres + backend + this SPA + bank) lives in
`next/backend/CLAUDE.md`. This file only covers the SPA-specific bits.

Quick start once the backend is up on `:18001`:

```bash
npm install
VITE_BACKEND_URL=http://localhost:18001 npx vite --port 5181 --host
# → http://localhost:5181/
```

The dev server always runs on **`:5181`** in this project — do NOT invoke
`preview_start` or launch it on another port. The user drives it in their
own browser tab.

## What lives where

- `src/main.tsx` — bootstrap, TanStack Query, MemoryRouter, tabs host.
- `src/shared/api/client.ts` — axios instance with `/api/v2` baseURL,
  JWT injector, refresh-on-401 flow, `X-Tenant` header from the current
  session.
- `src/shared/tabs/tabs-host.tsx` — multi-tab shell + history bridge
  (URL ↔ MemoryRouter). See the memory note on URL routing:
  every filter / page / search / sub-tab lives in the URL, read via
  `useUrlState` hooks. Reference implementation: `soliq/page.tsx`.
- `src/modules/settings/tenants/` — superadmin control plane.
  - `form-page.tsx` — Tenant create (dedicated / shared / **local**) +
    legacy KM import.
  - `detail-page.tsx` — Test ulanish, **Migratsiya** (rerun bootstrap DDL),
    Butunlay o'chirish (purge role + DB for `local` placement).
  - `api.ts` — `useCreateTenant`, `useImportTenant`, `useBootstrapTenant`,
    `usePurgeTenant`, plus the per-tenant company/key/user readers.
- `src/modules/keys/` — Key Manager surface.
  - `admin/km-admin-page.tsx` — Kompaniyalar list; `[↻ AIBA sync]` fires
    the KM_NATIVE_SIDEFX cascade to `api.aiba.uz`.
- `src/modules/bank/` — bank module (proxies backend → `next/bank`).

## Talking to the backend

- All API calls go through `src/shared/api/client.ts`. Base URL is
  `${VITE_BACKEND_URL}/api/v2` (dev) or `/api/v2` (nginx prod).
- Tenant context: the login response stores the tenant slug in localStorage
  and the axios interceptor stamps `X-Tenant` on every request.
- Superadmin surface (`/admin/*`) does not require `X-Tenant` — the JWT
  audience `sa` bypasses tenant scoping.

## URL routing convention

Multi-tab MemoryRouter + history bridge. ALL query state (filter, page,
search, sub-tab) lives in the URL and is read via `useUrlState`. This lets
tabs be duplicated, refreshed, and shared via link. When adding a new page,
mirror `src/modules/keys/admin/km-admin-page.tsx` or `soliq/page.tsx`.

## User guide (Qo'llanma) — MUST stay in sync with the code

The in-app user guide ships **inside this repo** as markdown and renders
wiki-style at `/m/guide` (profile dropdown → **Qo'llanma**):

- **One page per action/topic**: `src/modules/<module>/docs/pages/<NNN>-<slug>.<locale>.md`
  — `NNN` orders the sidebar (010, 020, …), `<slug>` is the page id used by
  cross-links, the `# H1` is the page title. ALL FOUR locales (`uz`,
  `uz_Cyrl`, `ru`, `en`) must exist per page and say the same thing.
  Example: `docs/pages/040-assign.ru.md` = "Назначение ответственного".
- **Cross-links between pages**: `[title](page:slug)` — renders as in-guide
  navigation (e.g. the create page links to `page:assign`). Every page ends
  with a "Related pages" block linking its neighbours; add in-text links
  wherever one action mentions another.
- Screenshots: `src/modules/<module>/docs/img/*.png`, referenced from the MD
  as `img/<name>.png`.
- Rendering: `src/modules/guide/` — a Vite glob bundles every
  `modules/*/docs/pages/*.md` at build time (no DB, no fetch; a deploy IS
  the docs update). Adding a guide for a new module = drop page files
  (+ `img/`) into that module's `docs/pages/` folder — it appears in the
  sidebar automatically.

**RULE: any change to user-facing behavior (new feature, renamed button,
changed flow, removed option) must update the affected guide sections in ALL
FOUR locale files in the same commit — and refresh the screenshots when the
UI changed visibly.** Write for a first-time user: plain words, short
sentences, numbered steps, a screenshot per key flow. Screenshots are captured
against the local app (puppeteer-core + system Chrome; look at the scratchpad
`shots/` scripts pattern: login → open the module tab → close the Home tab to
pin it → interact → screenshot; card dialogs open via `/m/tasks?card=<id>`).

## Mobile shell (m.html) — two entries, one core

The SPA ships TWO entries from one codebase (vite build.rollupOptions.input):

- `index.html` → `src/main.tsx` → desktop tab shell (unchanged).
- `m.html` → `src/app-mobile/main.tsx` → mobile shell: sticky top bar
  (company select + bell + avatar), bottom nav (Home/Tasks/Files/Wiki/Menu),
  BrowserRouter. nginx serves the entry by device (UA sniff) with a
  persistent `aiba_view` cookie override ("Mobil versiya" in the desktop
  profile dropdown ↔ "Desktop versiya" in the mobile Menu page).

**Fallback rule:** the mobile shell mounts the SAME route table as the
desktop tabs (`TabRoutes`) — every module page works on mobile from day one
(ModuleShell renders its rail as a horizontal chip strip under `md:`). A
custom mobile screen is added ONLY when a module is in the bottom nav or
heavily used on phones — put it in `src/app-mobile/` (own routes are listed
in `MOBILE_OWNED` in shell.tsx). Never fork logic: stores/api stay shared.

Legacy `useTabs.open()` calls are bridged to plain navigations on mobile
(store subscription in shell.tsx) — don't call useTabs from new mobile code.

⚠️ `vite.config.js` is a compiled copy that SHADOWS vite.config.ts — keep
both in sync (or delete the .js).

## CI/CD

Push to `main` on `gitlab.aiba.uz/next/frontend` → shell runner on
`10.0.0.35` (tag `uic-shell`, runs as `hamrayev`):

- `git fetch + reset --hard origin/main` in `/opt/aiba-next/next-frontend`
- `docker build` → new SPA image
- `docker compose up -d --force-recreate frontend`

The container serves the built SPA via nginx and terminates
`/api/*` upstream to the backend container (both live on the same compose
network). See `.gitlab-ci.yml`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Log-in redirect loop | JWT invalid / expired — clear localStorage + retry |
| `X-Tenant` header missing | tenant slug not in localStorage; make sure login response set it |
| 404 on `/api/v2/...` | Vite proxy not configured or backend down; check `vite.config.ts` and `curl http://127.0.0.1:18001/health` |
| Empty tenant list as superadmin | JWT audience mismatch — re-login as `superadmin` |
| «Migratsiya» button 500 | Backend can't apply bootstrap; usually owner mismatch on legacy tenant — see backend logs |
