# Lactate Threshold Test (Running)

Production-ready Next.js 16 app for running lactate threshold tests with Supabase auth/storage and interactive charts.

## Setup
- Requirements: Node 20+, npm.
- Install deps: `npm install`
- Copy environment file: `cp .env.example .env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Apply database schema: run `supabase/schema.sql` in your Supabase project (SQL editor or `psql`). This creates tables, indexes, defaults, and RLS policies.
- Supabase Auth: enable Email OTP/Magic Link and add `http://localhost:3000/auth/callback` to the redirect URLs.
- Dev server: `npm run dev` then open http://localhost:3000/lactate

## App flow
- `/lactate`: lists your sessions with protocol summary and progress.
- `/lactate/new`: creates a new session (default 10:00 warmup + 8 x 3:00 stages, sampling at 2:30 with a 30s window) and opens the runner with timers, sample countdown, optional beeps, and data capture.
- `/lactate/[id]`: session detail with editable points, notes, and an interactive lactate vs pace chart (optional HR overlay).

## Data model (Supabase)
- `public.lactate_tests`: session metadata, protocol JSON, timestamps, notes. RLS enforces `auth.uid() = user_id`.
- `public.lactate_points`: per-stage data (lactate mmol/L, pace seconds per km, HR, RPE, comments) with unique `(test_id, stage_index)` and indexes on `(test_id, stage_index)` and `(user_id)`. RLS matches `user_id`.

## Notes
- Pace is stored as integer seconds per km and formatted as `mm:ss/km` for display.
- X-axis on charts is reversed so faster paces appear to the right, matching rising intensity.
- Auth uses Supabase email magic links; sign-in form triggers a link to `/auth/callback`.
