# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend development (Vercel serverless + Vite)
npm run dev          # vercel dev — runs API functions + Vite together on :3000
npm run dev:vite     # vite only — no API, useful for UI-only work on :5173
npm run build        # runs migrate + generate-itinerary-manifests, then vite build
npm run lint         # eslint .

# Express server (separate process, port 4000)
cd server && npm run dev   # node --watch src/index.js
cd server && npm run db:studio   # Prisma Studio

# Database
node scripts/migrate.mjs           # apply SQL migrations
cd server && npx prisma generate   # regenerate Prisma client after schema changes
cd server && npx prisma migrate dev # create + apply a new migration

# PDF generation
npm run pdf          # tsx scripts/generate-pdf.mjs
```

## Architecture

This is a **dual-backend** setup. The same database, auth, and business logic is served two ways:

1. **`api/` — Vercel serverless functions** (used in production + `npm run dev`)
   - Each file is an edge/Node function at the path `/api/<name>`
   - ES modules with `export default` handler
   - Use `api/_lib/` for shared logic

2. **`server/` — Express server** (legacy / local dev alternative)
   - `server/src/routes/` mirrors the same endpoints
   - Uses Prisma ORM; `api/` functions use raw `pg` via `@vercel/postgres` or direct SQL
   - Run with `cd server && npm run dev` on port 4000

**In production only the Vercel functions are used.** The Express server exists as a secondary path and may lag behind.

## Auth Flow

- Clerk issues JWTs. All protected API routes call `verifyAuth(req)` from `api/_lib/verifyAuth.js`, which returns `clerkId`.
- `resolveUserCtx(req)` combines auth + DB lookup + admin-email fallback into a normalized `{ userId, role, isAdmin, isDesigner, creatorSlug }` context.
- `api/_lib/adminEmails.js` hardcodes admin emails for a bootstrap fallback (no DB row needed).
- Frontend access control lives in `src/lib/useUserCtx.jsx` — `isAdmin`, `isDesigner`, `canAccessBackoffice` flags.
- Custom sign-in/sign-up use Clerk hooks directly (`useSignIn`/`useSignUp`), not Clerk components. See Memory for why.

## Frontend Routing (`src/App.jsx`)

Two layout zones:
- **Public** — Navbar + Footer wrapper, paths like `/`, `/itineraries/*`, `/journal/*`
- **Admin** — No Navbar/Footer, all paths under `/admin/*`

`useUserCtx()` gates admin routes; users without `canAccessBackoffice` are redirected to `/`.

## Database

PostgreSQL on Neon. Schema lives in `server/prisma/schema.prisma`. Key relationships:
- `User` (Clerk-synced) → `Purchase` → `Itinerary`
- `Creator` → `Itinerary` (creator attribution)
- `CustomRequest` → `Itinerary` (designer-built custom plans)
- `DesignerPricingPlan` — per-designer pricing, referenced by `Purchase`

Raw SQL migrations also exist in `scripts/apply-migrations.sql` — check both Prisma migrations and this file when debugging schema history.

## Itinerary Content

Curated itineraries live in two places:
- `content/itineraries/<slug>/` — static editorial content, day images, gallery
- Database `Itinerary` table — CMS-managed fields, pricing, PDF URLs, asset overrides

`scripts/generate-itinerary-manifests.mjs` prebakes metadata from `content/` at build time into `src/lib/itineraryManifests.js`. **Edit manifests via the content directory, not the generated file.**

## Design System

All styling is inline styles (not Tailwind utilities). Colors: teal `#1B6B65`, gold `#C9A96E`, stone `#FAFAF8`, charcoal `#1C1A16`. Fonts: Playfair Display (headings), Inter (body) via Google Fonts in `index.css`. Animations use CSS transitions + IntersectionObserver.

## Key Constraints

- Never use em-dashes (—) in itinerary text. Use colons, commas, or full stops.
- Hotel descriptions: no invented locations or history; anchor to known landmarks; max 3 hotels per itinerary.
- `gallery/` and `research/` image folders: never download/generate/add files — only report missing filenames.
- `ItineraryAIGeneration` rows are immutable audit logs; never auto-publish AI drafts.
- React Compiler is disabled (causes performance regressions in this codebase).

## Environment Variables

Frontend (`.env`): `VITE_CLERK_PUBLISHABLE_KEY`, Stripe price IDs (`STRIPE_PRICE_PREMIUM_SHORT/ESSENTIAL/COMPLETE`), `EMAIL_FROM`.

Server (`server/.env`): `DATABASE_URL`, `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CLIENT_ORIGIN`.

Vercel functions share the frontend env context — serverless functions read `process.env` for the Stripe/Clerk/Resend keys.
