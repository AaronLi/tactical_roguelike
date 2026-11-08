// A stand-in for a Supabase project's database, for the cloud tests (tools/cloud.test.mjs, docs/cloud.md "Testing"): Postgres
// itself (PGlite, Postgres compiled to WebAssembly, in this process), with as much of Supabase's auth schema as the migrations
// lean on (auth.users, auth.uid() from the request's JWT claims, the anon and authenticated roles), the migrations in
// supabase/migrations applied on top. A query "as" a user runs as the authenticated role with that user's claims, as
// PostgREST runs one, so Row Level Security is Postgres's own, not a mock of it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH = `
create schema if not exists auth;
create table auth.users (id uuid primary key, email text unique, is_anonymous boolean not null default true, created_at timestamptz not null default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
end $$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- (Supabase's default: the API roles get everything on what's made in public; the migrations take back what they don't want)
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
`;

export async function openDb() {
  const db = new PGlite();
  await db.exec(AUTH);
  const dir = path.join(ROOT, 'supabase', 'migrations');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  // one at a time: a query as someone sets the role and the claims for its transaction
  let chain = Promise.resolve();
  const serial = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  return {
    db,
    // as a user (uid), or with no session (null: the anon role)
    as(uid, sql, params = []) {
      return serial(() => db.transaction(async (tx) => {
        await tx.query(`select set_config('role', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [uid ? 'authenticated' : 'anon', uid || '']);
        return (await tx.query(sql, params)).rows;
      }));
    },
    // as the database's owner (the dashboard's SQL editor): no RLS
    admin(sql, params = []) { return serial(async () => (await db.query(sql, params)).rows); },
    async user(email = null) {
      const id = crypto.randomUUID();
      await this.admin('insert into auth.users (id, email, is_anonymous) values ($1, $2, $3)', [id, email, !email]);
      return id;
    },
  };
}
