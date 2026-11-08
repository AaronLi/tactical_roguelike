-- career_add made idempotent: each addition the client sends carries an id it made (d.id), kept on the client until the reply
-- confirms it (js/cloud.ts, its in-flight records). An id already applied is skipped and the row returned as it is, so an addition
-- re-sent after a lost reply (a closed tab, a dropped connection) is never counted twice. Applied ids are kept 90 days.
create table public.career_applied (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         uuid not null,
  applied_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index career_applied_at on public.career_applied (user_id, applied_at);
alter table public.career_applied enable row level security;
create policy "own applied ids" on public.career_applied for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.career_applied from anon;
grant select, insert, delete on public.career_applied to authenticated;

create or replace function public.career_add(d jsonb) returns public.career
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  a jsonb := coalesce(d -> 'add', '{}'::jsonb);
  m jsonb := coalesce(d -> 'max', '{}'::jsonb);
  bl jsonb := d -> 'best_level';
  bc jsonb := d -> 'best_credits';
  rid uuid;
  n integer;
  r public.career;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(a) <> 'object' or jsonb_typeof(m) <> 'object' or pg_column_size(d) > 4096 then raise exception 'bad career delta' using errcode = '22023'; end if;
  insert into public.career (user_id) values (uid) on conflict (user_id) do nothing;
  -- (an addition already applied: the row as it is, nothing added)
  if d ? 'id' and jsonb_typeof(d -> 'id') = 'string' then
    begin rid := (d ->> 'id')::uuid; exception when others then raise exception 'bad career delta id' using errcode = '22023'; end;
    insert into public.career_applied (user_id, id) values (uid, rid) on conflict do nothing;
    get diagnostics n = row_count;
    if n = 0 then select * into r from public.career c where c.user_id = uid; return r; end if;
    delete from public.career_applied k where k.user_id = uid and k.applied_at < now() - interval '90 days';
  end if;
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
