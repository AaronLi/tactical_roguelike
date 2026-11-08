-- Breach Protocol: each player's progress, kept in their own rows (docs/cloud.md).
--   profiles  callsign, look and settings, one row a player
--   progress  the sidearm tree's unlocks and tallies, the wishlist, one row a player
--   career    the career's counters, one row a player, only ever added to (career_add)
--   runs      one row a run: when, who with, the levels played and how they went
-- Every table has Row Level Security on: a signed-in user (an anonymous guest is one too, role "authenticated") reads and
-- writes only rows whose user_id is their own auth.uid(). The anon key alone (no session) reaches nothing.
-- The client is trusted for its own numbers: nothing here stops a player writing what they like into their own rows
-- (see docs/cloud.md "Security" for what leaderboards would need).

-- ---------------------------------------------------------------- updated_at, kept by the database
create or replace function public.bp_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name           text check (char_length(name) <= 32),
  animal         text check (char_length(animal) <= 32),
  look           jsonb check (look is null or (jsonb_typeof(look) = 'object' and pg_column_size(look) <= 4096)),
  -- sens, fov, vol, loadKit, muted, quick, turn (js/cloud.ts PREFS)
  settings       jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 8192),
  -- when each of those was last changed (ms since 1970, the client's clock): the newer wins a merge
  mt             jsonb not null default '{}' check (jsonb_typeof(mt) = 'object' and pg_column_size(mt) <= 4096),
  schema_version smallint not null default 1 check (schema_version between 1 and 100),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- progress
create table public.progress (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- js/arsenal.ts: { got: [gun ids], n: { gun: { stat: count } }, pro: { gun: 1 }, on: { gun: bool } }
  arsenal        jsonb not null default '{}' check (jsonb_typeof(arsenal) = 'object' and pg_column_size(arsenal) <= 32768),
  -- the starred parts (js/shop.ts wishes)
  wishlist       jsonb not null default '[]' check (jsonb_typeof(wishlist) = 'array' and jsonb_array_length(wishlist) <= 500 and pg_column_size(wishlist) <= 32768),
  mt             jsonb not null default '{}' check (jsonb_typeof(mt) = 'object' and pg_column_size(mt) <= 4096),
  schema_version smallint not null default 1 check (schema_version between 1 and 100),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- career
-- The counters (js/career.ts). Written only through career_add, which adds to them (and raises the maxima), so two
-- devices playing on one account both count.
create table public.career (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  runs           integer not null default 0 check (runs between 0 and 10000000),
  runs_done      integer not null default 0 check (runs_done between 0 and 10000000),
  deepest        integer not null default 0 check (deepest between 0 and 100000),
  acts           integer not null default 0 check (acts between 0 and 10000000),
  levels         integer not null default 0 check (levels between 0 and 10000000),
  kills          integer not null default 0 check (kills between 0 and 100000000),
  incaps         integer not null default 0 check (incaps between 0 and 100000000),
  headshots      integer not null default 0 check (headshots between 0 and 100000000),
  arrests        integer not null default 0 check (arrests between 0 and 100000000),
  rescued        integer not null default 0 check (rescued between 0 and 100000000),
  civ_killed     integer not null default 0 check (civ_killed between 0 and 100000000),
  unauth         integer not null default 0 check (unauth between 0 and 100000000),
  deaths         integer not null default 0 check (deaths between 0 and 100000000),
  downs          integer not null default 0 check (downs between 0 and 100000000),
  revives        integer not null default 0 check (revives between 0 and 100000000),
  evidence       integer not null default 0 check (evidence between 0 and 100000000),
  credits        bigint  not null default 0 check (credits between 0 and 100000000000),
  -- the best runs: { id, start, lvl, credits, squad, outcome } (the run's own row is in runs, if it's still there)
  best_level     jsonb check (best_level is null or (jsonb_typeof(best_level) = 'object' and pg_column_size(best_level) <= 1024)),
  best_credits   jsonb check (best_credits is null or (jsonb_typeof(best_credits) = 'object' and pg_column_size(best_credits) <= 1024)),
  schema_version smallint not null default 1 check (schema_version between 1 and 100),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- runs
create table public.runs (
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id             uuid not null, -- made by the client, so a run's row is written again as it goes (upsert) and never twice
  started_at     timestamptz not null,
  ended_at       timestamptz,
  solo           boolean not null default true,
  host           boolean not null default true,
  squad          smallint not null default 1 check (squad between 1 and 16),
  joined_at      smallint check (joined_at between 1 and 10000), -- the level you joined at, when you joined a run already going
  -- playing: still going (or the page was closed before it ended, until the next visit says abandoned)
  outcome        text not null default 'playing' check (outcome in ('playing', 'wiped', 'left', 'abandoned')),
  deepest        smallint not null default 0 check (deepest between 0 and 10000),
  credits        integer not null default 0 check (credits between -100000000 and 100000000),
  kills          integer not null default 0 check (kills between 0 and 100000),
  arrests        integer not null default 0 check (arrests between 0 and 100000),
  -- [{ n, th, theme, night, stronghold, boss, cleared, kills, incaps, arrests, rescued, civKilled, evidence, downs, deaths, credits, report }]
  levels         jsonb not null default '[]' check (jsonb_typeof(levels) = 'array' and jsonb_array_length(levels) <= 200 and pg_column_size(levels) <= 65536),
  schema_version smallint not null default 1 check (schema_version between 1 and 100),
  updated_at     timestamptz not null default now(),
  primary key (user_id, id),
  check (ended_at is null or ended_at >= started_at)
);
create index runs_user_started on public.runs (user_id, started_at desc);

-- a player keeps their last 1000 runs (the oldest go as new ones come)
create or replace function public.bp_runs_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.runs r
   where r.user_id = new.user_id
     and (r.user_id, r.id) not in (select k.user_id, k.id from public.runs k where k.user_id = new.user_id order by k.started_at desc limit 1000);
  return null;
end $$;
revoke all on function public.bp_runs_cap() from public, anon, authenticated;

create trigger profiles_touch before update on public.profiles for each row execute function public.bp_touch();
create trigger progress_touch before update on public.progress for each row execute function public.bp_touch();
create trigger career_touch   before update on public.career   for each row execute function public.bp_touch();
create trigger runs_touch     before update on public.runs     for each row execute function public.bp_touch();
create trigger runs_cap       after insert  on public.runs     for each row execute function public.bp_runs_cap();

-- ---------------------------------------------------------------- Row Level Security: your own rows, nobody else's
alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.career   enable row level security;
alter table public.runs     enable row level security;

create policy "own profile"  on public.profiles for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own progress" on public.progress for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own career"   on public.career   for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own runs"     on public.runs     for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- no session, no access (Supabase grants the API roles everything on public tables by default; RLS would stop them anyway)
revoke all on public.profiles, public.progress, public.career, public.runs from anon;
grant select, insert, update, delete on public.profiles, public.progress, public.career, public.runs to authenticated;

-- ---------------------------------------------------------------- career_add: the only way the counters change
-- d: { add: { kills: 3, ... }, max: { deepest: 7 }, best_level: {...}, best_credits: {...} }. Each addition is capped (a
-- client that's been offline a long time sends a lot at once, but not this much), and returns the row as it now is.
create or replace function public.career_add(d jsonb) returns public.career
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  a jsonb := coalesce(d -> 'add', '{}'::jsonb);
  m jsonb := coalesce(d -> 'max', '{}'::jsonb);
  bl jsonb := d -> 'best_level';
  bc jsonb := d -> 'best_credits';
  r public.career;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(a) <> 'object' or jsonb_typeof(m) <> 'object' or pg_column_size(d) > 4096 then raise exception 'bad career delta' using errcode = '22023'; end if;
  insert into public.career (user_id) values (uid) on conflict (user_id) do nothing;
  update public.career c set
    runs       = c.runs       + least(greatest(coalesce((a ->> 'runs')::integer, 0), 0), 1000),
    runs_done  = c.runs_done  + least(greatest(coalesce((a ->> 'runs_done')::integer, 0), 0), 1000),
    acts       = c.acts       + least(greatest(coalesce((a ->> 'acts')::integer, 0), 0), 1000),
    levels     = c.levels     + least(greatest(coalesce((a ->> 'levels')::integer, 0), 0), 10000),
    kills      = c.kills      + least(greatest(coalesce((a ->> 'kills')::integer, 0), 0), 100000),
    incaps     = c.incaps     + least(greatest(coalesce((a ->> 'incaps')::integer, 0), 0), 100000),
    headshots  = c.headshots  + least(greatest(coalesce((a ->> 'headshots')::integer, 0), 0), 100000),
    arrests    = c.arrests    + least(greatest(coalesce((a ->> 'arrests')::integer, 0), 0), 100000),
    rescued    = c.rescued    + least(greatest(coalesce((a ->> 'rescued')::integer, 0), 0), 100000),
    civ_killed = c.civ_killed + least(greatest(coalesce((a ->> 'civ_killed')::integer, 0), 0), 100000),
    unauth     = c.unauth     + least(greatest(coalesce((a ->> 'unauth')::integer, 0), 0), 100000),
    deaths     = c.deaths     + least(greatest(coalesce((a ->> 'deaths')::integer, 0), 0), 100000),
    downs      = c.downs      + least(greatest(coalesce((a ->> 'downs')::integer, 0), 0), 100000),
    revives    = c.revives    + least(greatest(coalesce((a ->> 'revives')::integer, 0), 0), 100000),
    evidence   = c.evidence   + least(greatest(coalesce((a ->> 'evidence')::integer, 0), 0), 100000),
    credits    = c.credits    + least(greatest(coalesce((a ->> 'credits')::bigint, 0), 0), 100000000),
    deepest    = greatest(c.deepest, least(greatest(coalesce((m ->> 'deepest')::integer, 0), 0), 100000)),
    best_level = case when jsonb_typeof(bl) = 'object' and coalesce((bl ->> 'lvl')::integer, 0) > coalesce((c.best_level ->> 'lvl')::integer, 0) then bl else c.best_level end,
    best_credits = case when jsonb_typeof(bc) = 'object' and coalesce((bc ->> 'credits')::integer, 0) > coalesce((c.best_credits ->> 'credits')::integer, 0) then bc else c.best_credits end
  where c.user_id = uid
  returning * into r;
  return r;
end $$;
revoke all on function public.career_add(jsonb) from public, anon;
grant execute on function public.career_add(jsonb) to authenticated;
