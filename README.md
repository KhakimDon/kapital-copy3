# AIBA Next — Frontend

React + Vite SPA for **AIBA Next**. TypeScript · shadcn/ui (Radix + Tailwind) ·
TanStack Query · Zustand · React Router · react-i18next (4 languages) · light/dark
theme.

> **One of two repos.** The API lives in the separate
> [`backend`](https://gitlab.aiba.uz/aiba-next-poc/backend) repo. For the full
> stack (DB, Redis, MinIO, backend, this app, nginx) use the workspace
> `docker-compose.yml` — see the backend repo's README.

---

## Run with Docker (full stack)

From the workspace root (with `backend/` + `web/` cloned side by side and the
`docker-compose.yml`):

```bash
docker compose up -d --build
```

Open **http://localhost:18080** (nginx) — or **http://localhost:5173** for the
Vite dev server directly (HMR). Login: **`admin` / `admin123`** (after the backend
is migrated + seeded — see backend README).

The compose `web` service just runs `npm install && npm run dev` on `node:22`
against a mounted volume, so edits hot-reload.

---

## Run standalone (frontend only)

Node ≥ 20 (Docker uses 22). You need the backend reachable.

```bash
npm install
# point the dev proxy at your backend (default targets the docker service name):
VITE_BACKEND_URL=http://localhost:18000 npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api/*` → `VITE_BACKEND_URL`
(see [vite.config.ts](vite.config.ts)).

```bash
npm run build       # tsc -b && vite build  → dist/
npm run preview     # serve the production build on :5173
npm run typecheck   # tsc -b --noEmit
npm run lint        # eslint (max-warnings 0)
```

---

## Layout

```
web/src/
├── app/
│   ├── router.tsx        # routes + <Protected> auth gate
│   ├── providers.tsx     # QueryClient · Router · i18n
│   └── layout/           # Shell, header-nav, company-picker, theme-toggle
├── shared/
│   ├── api/              # fetch wrappers (sends Authorization: Bearer)
│   ├── store/            # zustand: auth, theme
│   ├── i18n/             # uz · uz_Cyrl · ru · en
│   └── lib/              # utils (cn, …)
├── components/ui/        # shadcn primitives (button, dialog, select, dropdown-menu, …)
└── modules/              # one folder per feature (companies, bank, documents, keys, …)
```

## Theming (light / dark)

- Tokens: `src/index.css` (`:root` + `.dark`, stock shadcn slate).
- State: `src/shared/store/theme.ts` — `light` / `dark` / `system`, persisted to
  `localStorage` (`aiba.theme`), toggles `.dark` on `<html>`.
- Switcher: header **☀️/🌙** button (`src/app/layout/theme-toggle.tsx`).
- An inline script in [index.html](index.html) applies the saved theme before
  first paint (no flash).

## Conventions

- All form controls are **shadcn** components — no native `<button>/<input>/<select>`.
- Data fetching via **TanStack Query**; server state never in zustand.
- New shadcn primitive? Add it under `components/ui/` and keep the standard
  `data-[state=*]:animate-*` classes so enter/exit animations work.
