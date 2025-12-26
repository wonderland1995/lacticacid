-- Add metrics jsonb and speed_kmh to lactate_points
alter table if exists public.lactate_points
  add column if not exists metrics jsonb not null default '{}'::jsonb;

alter table if exists public.lactate_points
  add column if not exists speed_kmh numeric;
