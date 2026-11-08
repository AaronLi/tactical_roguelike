// A stand-in for supabase-js's client, over the Postgres of tools/cloud_db.mjs: as much of it as js/cloud.ts uses (auth: the session,
// anonymous sign-in, email by magic link and its code, sign-out; PostgREST: select / eq / order / limit / maybeSingle, upsert, rpc),
// each table call run as the signed-in user, so Row Level Security decides as it would on Supabase. The "server" (the database, the
// sent emails) is shared by every client made from it, as one project is by every browser; each client keeps its session in its own
// storage, as a browser does. `server.offline = true` makes every call fail as fetch does with no network.
export function fakeServer(D) {
  const server = { D, offline: false, mail: [], calls: [] };
  const netErr = () => ({ message: 'TypeError: Failed to fetch', status: 0, name: 'AuthRetryableFetchError' });
  const isoRow = (r) => { if (!r) return r; const o = {}; for (const [k, v] of Object.entries(r)) o[k] = v instanceof Date ? v.toISOString() : typeof v === 'bigint' ? Number(v) : v; return o; };
  const userOf = async (id) => { const [u] = await D.admin('select id, email, is_anonymous from auth.users where id = $1', [id]); return u ? { id: u.id, email: u.email || undefined, is_anonymous: u.is_anonymous, aud: 'authenticated' } : null; };

  server.client = (url, key, opts = {}, storage) => {
    const SKEY = 'sb-fake-auth-token';
    const subs = new Set();
    let session = null;
    try { const s = storage && storage.getItem(SKEY); session = s ? JSON.parse(s) : null; } catch (e) { session = null; }
    const keep = () => { if (!storage) return; if (session) storage.setItem(SKEY, JSON.stringify(session)); else storage.removeItem(SKEY); };
    const emit = (ev) => { for (const f of subs) f(ev, session); };
    const setSession = (user, ev) => { session = user ? { access_token: 'fake.' + user.id, user } : null; keep(); emit(ev); };
    const call = async (what, fn) => { server.calls.push(what); if (server.offline) return { data: null, error: netErr() }; try { return { data: await fn(), error: null }; } catch (e) { return { data: null, error: { message: e.message, code: e.code } }; } };
    const uid = () => (session ? session.user.id : null);

    const auth = {
      onAuthStateChange(f) { subs.add(f); setTimeout(() => f('INITIAL_SESSION', session), 0); return { data: { subscription: { unsubscribe: () => subs.delete(f) } } }; },
      async getSession() { return { data: { session }, error: null }; },
      async signInAnonymously() {
        const r = await call('auth.anon', async () => { const id = await D.user(null); return { user: await userOf(id) }; });
        if (r.data) { setSession(r.data.user, 'SIGNED_IN'); r.data.session = session; }
        return r;
      },
      async updateUser(attrs, o = {}) {
        return call('auth.updateUser', async () => {
          if (!session) throw new Error('Auth session missing!');
          const token = String(100000 + Math.floor(Math.random() * 900000));
          server.mail.push({ to: attrs.email, type: 'email_change', token, uid: session.user.id, redirect: o.emailRedirectTo });
          return { user: session.user };
        });
      },
      async signInWithOtp({ email, options = {} }) {
        return call('auth.otp', async () => {
          const token = String(100000 + Math.floor(Math.random() * 900000));
          server.mail.push({ to: email, type: 'email', token, redirect: options.emailRedirectTo, create: options.shouldCreateUser !== false });
          return { user: null, session: null };
        });
      },
      async verifyOtp({ email, token, type }) {
        const r = await call('auth.verify', async () => {
          const m = [...server.mail].reverse().find((x) => x.to === email && x.token === token && x.type === type && !x.used);
          if (!m) throw new Error('Token has expired or is invalid');
          m.used = true;
          if (type === 'email_change') {
            await D.admin('update auth.users set email = $1, is_anonymous = false where id = $2', [email, m.uid]);
            return { user: await userOf(m.uid) };
          }
          let [u] = await D.admin('select id from auth.users where email = $1', [email]);
          if (!u) { if (!m.create) throw new Error('Signups not allowed for otp'); u = { id: await D.user(email) }; }
          return { user: await userOf(u.id) };
        });
        if (r.data) { const same = session && session.user.id === r.data.user.id; setSession(r.data.user, same ? 'USER_UPDATED' : 'SIGNED_IN'); r.data.session = session; }
        return r;
      },
      async signOut() { const r = await call('auth.signOut', async () => null); if (!r.error) setSession(null, 'SIGNED_OUT'); return r; },
    };

    // PostgREST's builder, as far as it's used
    function from(table) {
      const q = { table, where: [], order: null, limit: null };
      const run = async (single) => call('select ' + table, async () => {
        const params = [], w = q.where.map(([c, v]) => { params.push(v); return `${c} = $${params.length}`; });
        const sql = `select * from public.${table}${w.length ? ' where ' + w.join(' and ') : ''}${q.order ? ` order by ${q.order[0]} ${q.order[1] ? 'asc' : 'desc'}` : ''}${q.limit ? ' limit ' + (q.limit | 0) : ''}`;
        const rows = (await D.as(uid(), sql, params)).map(isoRow);
        if (single) { if (rows.length > 1) throw new Error('multiple rows'); return rows[0] || null; }
        return rows;
      });
      const b = {
        select() { return b; },
        eq(c, v) { q.where.push([c, v]); return b; },
        order(c, o = {}) { q.order = [c, o.ascending !== false]; return b; },
        limit(n) { q.limit = n; return b; },
        maybeSingle() { return run(true); },
        then(res, rej) { return run(false).then(res, rej); },
        upsert(rows, o = {}) {
          return call('upsert ' + table, async () => {
            const list = Array.isArray(rows) ? rows : [rows], conflict = (o.onConflict || 'user_id').split(',').map((s) => s.trim());
            for (const r of list) {
              const cols = Object.keys(r), vals = cols.map((c) => (r[c] !== null && typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c]));
              const set = cols.filter((c) => !conflict.includes(c)).map((c) => `${c} = excluded.${c}`);
              await D.as(uid(), `insert into public.${table} (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')}) on conflict (${conflict.join(', ')}) ${set.length ? 'do update set ' + set.join(', ') : 'do nothing'}`, vals);
            }
            return null;
          });
        },
      };
      return b;
    }
    async function rpc(name, args) {
      return call('rpc ' + name, async () => {
        if (name !== 'career_add') throw new Error('no function ' + name);
        const rows = await D.as(uid(), 'select * from public.career_add($1::jsonb)', [JSON.stringify(args.d)]);
        return isoRow(rows[0]);
      });
    }
    return { auth, from, rpc };
  };
  return server;
}
