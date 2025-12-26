-- Schema for Lactate Threshold Test app
create extension if not exists "pgcrypto";

create table if not exists public.lactate_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Lactate Threshold Test',
  sport text not null default 'running',
  protocol jsonb not null default '{"warmupSeconds":600,"stageSeconds":180,"numStages":8,"sampleOffsetSeconds":150,"sampleWindowSeconds":30}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.lactate_points (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.lactate_tests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stage_index int not null,
  pace_seconds_per_km int not null,
  lactate_mmol numeric not null,
  hr_bpm int,
  rpe int,
  comments text,
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(test_id, stage_index)
);

create index if not exists lactate_points_test_stage_idx on public.lactate_points (test_id, stage_index);
create index if not exists lactate_points_user_idx on public.lactate_points (user_id);

alter table public.lactate_tests enable row level security;
alter table public.lactate_points enable row level security;

create policy "Users can manage their own tests" on public.lactate_tests
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own points" on public.lactate_points
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
