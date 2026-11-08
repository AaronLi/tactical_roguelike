-- Guests who never came back: anonymous users who never linked an email and haven't been active for 90 days are deleted, with
-- their rows (profiles, progress, career and runs cascade from auth.users). Active: signed in, their user record updated, or any
-- of their rows written (a guest who plays keeps writing them). Run daily by pg_cron, when the project has it (docs/cloud.md:
-- Database > Extensions > pg_cron); without it the function is still made, and the schedule is skipped with a notice.
create or replace function public.bp_cleanup_guests(idle_days integer default 90) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if idle_days is null or idle_days < 30 then raise exception 'idle_days must be at least 30' using errcode = '22023'; end if;
  with gone as (
    delete from auth.users u
     where u.is_anonymous
       and u.email is null
       and greatest(
             coalesce(u.last_sign_in_at, u.created_at), coalesce(u.updated_at, u.created_at), u.created_at,
             coalesce((select max(p.updated_at) from public.profiles p where p.user_id = u.id), u.created_at),
             coalesce((select max(p.updated_at) from public.progress p where p.user_id = u.id), u.created_at),
             coalesce((select max(c.updated_at) from public.career c where c.user_id = u.id), u.created_at),
             coalesce((select max(r.updated_at) from public.runs r where r.user_id = u.id), u.created_at)
           ) < now() - make_interval(days => idle_days)
     returning 1)
  select count(*) into n from gone;
  return n;
end $$;
-- (the database's own: not callable through the API)
revoke all on function public.bp_cleanup_guests(integer) from public, anon, authenticated;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron is not available (%): guest cleanup not scheduled. Enable it under Database > Extensions and run this migration again, or call public.bp_cleanup_guests() yourself.', sqlerrm;
    return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname = 'bp-cleanup-guests';
  perform cron.schedule('bp-cleanup-guests', '17 4 * * *', 'select public.bp_cleanup_guests(90)');
end $$;
