# Capacitor Mobile Readiness

## Current status

Reflekt can be prepared for a Capacitor wrapper, but the current Next.js app is
not compatible with a full static export yet.

## Why static export is blocked right now

These pages currently fetch from the local Next.js API route:

- `/` via `app/page.tsx`
- `/my-feed` via `app/my-feed/page.tsx`
- `/article/[id]` via `app/article/[id]/page.tsx`

That route lives at `app/api/news/route.ts` and fetches live news server-side.
If Next.js is switched to `output: "export"`, the API route will not exist in
the exported build, so news loading would break.

## Safe recommendation right now

Use Capacitor as a thin native wrapper around the deployed web app on Vercel.

Recommended path:

1. Keep the current Next.js web deployment as-is.
2. Deploy Reflekt to Vercel.
3. For the mobile wrapper, point Capacitor at the deployed HTTPS URL during
   native setup instead of relying on a local `out/` export.

The current iOS wrapper should load the hosted Vercel app:

- `https://my-news-app-omega-orpin.vercel.app`

This is intentional because the app still depends on `/api/news`, which is
provided by the Next.js server and would not be available in a pure static
export.

## Included setup

This repo now includes:

- Capacitor packages in `package.json`
- `capacitor.config.ts` with:
  - `appName: "Reflekt"`
  - `appId: "app.mirur.news"`
  - `webDir: "out"`
  - `server.url: "https://my-news-app-omega-orpin.vercel.app"`

## Before switching to true static export

Refactor the live news flow so the app no longer depends on `app/api/news/route.ts`.
Possible options:

- call the external news service directly from the client
- move news fetching to a separate hosted backend
- pre-generate article JSON during a build pipeline and read from static assets

Only after that refactor should `next.config.ts` be updated for static export.
