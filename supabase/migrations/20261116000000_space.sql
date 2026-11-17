-- The game in space (docs/space.md, docs/cloud.md): what's new to keep.
--   progress.loadout   the loadout's trees (js/loadout.ts, U.store 'loadout'): XP, the pieces earned, the challenges' tallies, what's
--                      picked, its attachments, colours and throwables. Merged by the client: the XP and each tally the higher,
--                      the pieces earned the union, the picks the newer side's.
--   career.missions    the missions' counters, one object: { done, artifact, hvt, destruct, hostage, assault, hvt_alive, hvt_dead,
--                      ship_transport, ship_small, ship_medium, ship_large, ship_capital, looted } (more keys as the game grows: no
--                      migration for those). Added to through career_add, as the other counters are.
--   career.hardest, best_pay, big_class, best_rank   the bests: the hardest mission done (its difficulty), the most a mission paid,
--                      the biggest class of ship boarded (1 a civilian transport .. 5 a capital ship), the highest rank. Maxima.
--   runs.missions      a run's missions, as its levels are kept: [{ name, kind, obj, size, th, diff, pay, bonus, hvt, freed, at }]
-- Every addition is nullable-safe and defaulted, so a client from before this (one that never sends any of it) works as it did.

alter table public.progress
  add column loadout jsonb not null default '{}' check (jsonb_typeof(loadout) = 'object' and pg_column_size(loadout) <= 65536);

alter table public.career
  add column missions  jsonb    not null default '{}' check (jsonb_typeof(missions) = 'object' and pg_column_size(missions) <= 4096),
  add column hardest   smallint not null default 0 check (hardest between 0 and 1000),
  add column best_pay  integer  not null default 0 check (best_pay between 0 and 100000000),
  add column big_class smallint not null default 0 check (big_class between 0 and 10),
  add column best_rank smallint not null default 0 check (best_rank between 0 and 1000);

alter table public.runs
  add column missions jsonb not null default '[]' check (jsonb_typeof(missions) = 'array' and jsonb_array_length(missions) <= 100 and pg_column_size(missions) <= 32768);

-- career_add, as 20261109000000_career_idempotent.sql made it, and: d.missions, the missions' counters to add (each key a name of at most
-- 24 lower-case letters, digits or underscores, at most 40 of them, each addition capped like the others'); d.max's hardest, best_pay,
-- big_class and best_rank, taken as maxima like deepest.
create or replace function public.career_add(d jsonb) returns public.career
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  a jsonb := coalesce(d -> 'add', '{}'::jsonb);
  m jsonb := coalesce(d -> 'max', '{}'::jsonb);
  ms jsonb := coalesce(d -> 'missions', '{}'::jsonb);
  bl jsonb := d -> 'best_level';
  bc jsonb := d -> 'best_credits';
  rid uuid;
  n integer;
  k text;
  v jsonb;
  mis jsonb;
  r public.career;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(a) <> 'object' or jsonb_typeof(m) <> 'object' or jsonb_typeof(ms) <> 'object' or pg_column_size(d) > 4096 then raise exception 'bad career delta' using errcode = '22023'; end if;
  if (select count(*) from jsonb_object_keys(ms)) > 40 then raise exception 'bad career delta' using errcode = '22023'; end if;
  insert into public.career (user_id) values (uid) on conflict (user_id) do nothing;
  -- (an addition already applied: the row as it is, nothing added)
  if d ? 'id' and jsonb_typeof(d -> 'id') = 'string' then
    begin rid := (d ->> 'id')::uuid; exception when others then raise exception 'bad career delta id' using errcode = '22023'; end;
    insert into public.career_applied (user_id, id) values (uid, rid) on conflict do nothing;
    get diagnostics n = row_count;
    if n = 0 then select * into r from public.career c where c.user_id = uid; return r; end if;
    delete from public.career_applied k2 where k2.user_id = uid and k2.applied_at < now() - interval '90 days';
  end if;
  -- the missions' counters, added key by key
  select c.missions into mis from public.career c where c.user_id = uid for update;
  for k, v in select * from jsonb_each(ms) loop
    if k !~ '^[a-z0-9_]{1,24}$' or jsonb_typeof(v) <> 'number' then raise exception 'bad career delta' using errcode = '22023'; end if;
    mis := mis || jsonb_build_object(k, least(coalesce((mis ->> k)::bigint, 0) + least(greatest(floor((v #>> '{}')::numeric)::bigint, 0), 1000), 100000000));
  end loop;
  if pg_column_size(mis) > 4096 then raise exception 'too many mission counters' using errcode = '22023'; end if;
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
    deepest    = greatest(c.deepest,   least(greatest(coalesce((m ->> 'deepest')::integer, 0), 0), 100000)),
    hardest    = greatest(c.hardest,   least(greatest(coalesce((m ->> 'hardest')::integer, 0), 0), 1000)),
    best_pay   = greatest(c.best_pay,  least(greatest(coalesce((m ->> 'best_pay')::integer, 0), 0), 100000000)),
    big_class  = greatest(c.big_class, least(greatest(coalesce((m ->> 'big_class')::integer, 0), 0), 10)),
    best_rank  = greatest(c.best_rank, least(greatest(coalesce((m ->> 'best_rank')::integer, 0), 0), 1000)),
    missions   = mis,
    best_level = case when jsonb_typeof(bl) = 'object' and coalesce((bl ->> 'lvl')::integer, 0) > coalesce((c.best_level ->> 'lvl')::integer, 0) then bl else c.best_level end,
    best_credits = case when jsonb_typeof(bc) = 'object' and coalesce((bc ->> 'credits')::integer, 0) > coalesce((c.best_credits ->> 'credits')::integer, 0) then bc else c.best_credits end
  where c.user_id = uid
  returning * into r;
  return r;
end $$;
revoke all on function public.career_add(jsonb) from public, anon;
grant execute on function public.career_add(jsonb) to authenticated;
