'use strict';
// Cloud saves (docs/cloud.md): your progress in a Supabase project, so it survives a cleared browser and follows you to another
// device. What's kept: the sidearm tree (G.U.store 'arsenal'), your callsign, look and settings, the wishlist, the career and the
// run log (js/career.ts). It all lives in this browser first, as it always has (G.U.store, under bp_); this copies it up and back.
//   - Not set up (js/cloudconfig.ts empty) or ?cloud=0: nothing happens here past drawing the menu's Account box. No request.
//   - Set up: until you sign in, nothing changes either: everything's saved in this browser, and the Supabase client isn't even
//     loaded (it loads from the CDN when you open the Account box, or when there's a session to restore; never in the simulation's
//     thread). "Sign in with email" (a magic link, or its code) makes the account if it's new; what's here merges into it.
//   - Changes are written a few seconds after they're made (debounced), queued while offline (bp_cloudq) and sent when back.
//   - On signing in, what's here merges with what the account has (merge rules: docs/cloud.md, and the functions below).
// The page only: the server worker never loads this file (docs/threads.md).
type CloudState = 'off' | 'idle' | 'loading' | 'ok' | 'syncing' | 'offline' | 'error';
type SbClient = import('@supabase/supabase-js').SupabaseClient;
type SbUser = import('@supabase/supabase-js').User;
// owner: the account this browser's copy is of (null: none, a guest save). mig: the account a guest save is being moved into, not yet
// confirmed; migSent: how much of the guest's career that account has confirmed so far (so a resumed move adds only the rest)
interface CloudMeta { v: number; owner: string | null; ownerAnon: boolean; mt: Record<string, number>; mig: string | null; migSent: Record<string, number> }
// a career addition sent and not yet confirmed (bp_cloudfly): re-sent, by its id, until it is (career_add skips an id it's applied)
interface CloudFly { id: string; uid: string; d: CloudQueue; mig: boolean }
interface CloudQueue { add: Record<string, number>; max: Record<string, number>; best: Record<string, CareerBest>; profile: number; progress: number }
const G_Cloud = (() => {
  const V = 1; // (the data's shape: schema_version in every row. The client's version is in load's import, and js/types/supabase-cdn.d.ts)
  // what's synced, by where it goes (never the TURN relay's settings, 'turn': a connection's credentials stay in this browser): the profile row's columns, its settings (jsonb), and the progress row
  const PROFILE = ['name', 'look'], SETTINGS = ['animals', 'sens', 'fov', 'vol', 'loadKit', 'muted', 'quick'], PROGRESS = ['arsenal', 'wishlist'];
  const PREFS = [...PROFILE, ...SETTINGS], SYNCED = new Set([...PREFS, ...PROGRESS]);
  const DEBOUNCE = 4000, RETRY0 = 5000, RETRY_MAX = 60000;
  const q = new URLSearchParams(location.search);
  let state: CloudState = 'off', why = '', client: SbClient | null = null, user: SbUser | null = null, loading: Promise<SbClient | null> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined, retryMs = RETRY0, busy = false, again = false, lastOk = 0;
  let mail: { email: string } | null = null, mailMsg = '', mailErr = false;

  // ------------------------------------------------------------- config
  function config() {
    const o = (window as any).__bpCloudConfig, C = G.CloudConfig;
    const src = o && typeof o === 'object' ? { u: o.url, k: o.key } : { u: C && C.SUPABASE_URL, k: C && C.SUPABASE_ANON_KEY }; // (a test's stand-in project, wholly, if it set one)
    return { url: String(src.u || '').trim(), key: String(src.k || '').trim() };
  }
  const switchedOff = () => q.get('cloud') === '0';
  const configured = () => { const c = config(); return !!(c.url && c.key); };
  const on = () => configured() && !switchedOff();

  // ------------------------------------------------------------- what's kept here about the cloud
  const S = G.U.store;
  let metaV: CloudMeta | null = null, queueV: CloudQueue | null = null;
  function meta(): CloudMeta {
    if (!metaV) { const m = S.get('cloudmeta', null); metaV = { v: V, owner: m && typeof m.owner === 'string' ? m.owner : null, ownerAnon: !!(m && m.ownerAnon), mt: (m && m.mt && typeof m.mt === 'object') ? m.mt : {}, mig: m && typeof m.mig === 'string' ? m.mig : null, migSent: (m && m.migSent) || {} }; }
    return metaV;
  }
  const keepMeta = () => S.put('cloudmeta', meta());
  function Q(): CloudQueue {
    if (!queueV) { const v = S.get('cloudq', null) || {}; queueV = { add: v.add || {}, max: v.max || {}, best: v.best || {}, profile: v.profile ? 1 : 0, progress: v.progress ? 1 : 0 }; }
    return queueV;
  }
  const keepQ = () => S.put('cloudq', Q());
  let flyV: CloudFly[] | null = null;
  const fly = (): CloudFly[] => flyV || (flyV = (S.get('cloudfly', []) || []).filter((r: any) => r && typeof r.id === 'string' && r.d && r.d.add));
  const keepFly = () => S.put('cloudfly', fly());
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
  let BATCH = 50; // (runs sent at a time)
  const careerPending = (x: CloudQueue) => Object.keys(x.add).length + Object.keys(x.max).length + Object.keys(x.best).length > 0;

  // a key of yours changed (G.U.store.set): when, and that it's to go up
  function onSet(k: string, _v: unknown, auto: boolean) {
    if (!SYNCED.has(k)) return;
    const m = meta();
    if (!auto) m.mt[k] = Date.now(); else if (m.mt[k] == null) m.mt[k] = 0;
    keepMeta();
    if (!on()) return;
    const x = Q(); if (PROGRESS.includes(k)) x.progress = 1; else x.profile = 1; keepQ();
    want();
  }
  // the career's counters (js/career.ts): added to the account (career_add), never overwritten
  function add(a: Record<string, number>, mx: Record<string, number> = {}, best: Record<string, CareerBest> = {}) {
    const x = Q();
    for (const [k, n] of Object.entries(a)) x.add[k] = (x.add[k] || 0) + n;
    for (const [k, n] of Object.entries(mx)) x.max[k] = Math.max(x.max[k] || 0, n);
    for (const [k, b] of Object.entries(best)) { const o = x.best[k], f = k === 'best_level' ? 'lvl' : 'credits'; if (!o || (b as any)[f] > (o as any)[f]) x.best[k] = b; }
    // (before this browser's had an account, there's nothing to queue: the first sign-in takes the whole career as it is)
    if (meta().owner) keepQ(); else queueV = { ...x, add: {}, max: {}, best: {} };
    if (on()) want();
  }
  function runChanged() { if (on()) want(); }
  // there's something to send: a session first if there isn't one (a guest), then a flush in a moment
  function want() {
    if (!on()) return;
    if (user) schedule(); // (signed out: it stays here, and merges in when you sign in)
  }
  // A write later, for whoever's signed in now (and only them: signed out or in as someone else by then, it's dropped). Every auth
  // change clears it (switched), and every write checks it's still for the signed-in user after each wait (alive).
  function schedule(ms = DEBOUNCE) { clearTimeout(timer); const for_ = user ? user.id : null; timer = setTimeout(() => { if (for_ && user && user.id === for_) flush(); }, ms); }
  let epoch = 0; // (bumped on every change of who's signed in: an auth event from before is stale)
  function switched() { epoch++; clearTimeout(timer); again = false; retryMs = RETRY0; }
  const SWITCHED = { switched: true };
  // still the user this work was for? If not, the work stops here, quietly (theirs stays queued for them: bp_cloudq, bp_cloudfly)
  function alive(uid: string) { if (!user || user.id !== uid) throw SWITCHED; }

  // ------------------------------------------------------------- merging (pure: tools/cloud.test.mjs tests them)
  // Preferences (callsign, look, settings, the wishlist): each key the newer of the two, by when it was changed (mt, the
  // changing device's clock); a tie, or one never changed by hand on either side (mt 0), is the account's. One side without it: the other's.
  function mergePrefs(keys: string[], lv: Record<string, any>, lmt: Record<string, number>, cv: Record<string, any>, cmt: Record<string, number>) {
    const vals: Record<string, any> = {}, mt: Record<string, number> = {}, toLocal: string[] = [];
    let toCloud = false;
    for (const k of keys) {
      const hl = lv[k] !== undefined, hc = cv[k] !== undefined && cv[k] !== null;
      const local = hl && (!hc || (lmt[k] || 0) > (cmt[k] || 0));
      if (!hl && !hc) continue;
      vals[k] = local ? lv[k] : cv[k]; mt[k] = local ? lmt[k] || 0 : cmt[k] || 0;
      if (!local && JSON.stringify(lv[k]) !== JSON.stringify(cv[k])) toLocal.push(k);
      if (local && (JSON.stringify(lv[k]) !== JSON.stringify(cv[k]) || (lmt[k] || 0) !== (cmt[k] || 0))) toCloud = true;
    }
    return { vals, mt, toLocal, toCloud };
  }
  // The sidearm tree: the guns earned, the union; each tally, the higher; a pro build earned on either, earned; whether you
  // start in pro mode with it (on), the newer side's (newerB: b's arsenal changed later than a's).
  function mergeArsenal(a: any, b: any, newerB: boolean) {
    const A = a && typeof a === 'object' ? a : {}, B = b && typeof b === 'object' ? b : {};
    const got = [...new Set([...(Array.isArray(A.got) ? A.got : []), ...(Array.isArray(B.got) ? B.got : [])])].filter((x) => typeof x === 'string');
    const n: Record<string, Record<string, number>> = {};
    for (const src of [A.n || {}, B.n || {}]) for (const [g, st] of Object.entries(src as Record<string, Record<string, number>>)) {
      const o = n[g] || (n[g] = {});
      for (const [k, v] of Object.entries(st || {})) if (typeof v === 'number') o[k] = Math.max(o[k] || 0, v);
    }
    const pro: Record<string, number> = {};
    for (const src of [A.pro || {}, B.pro || {}]) for (const [g, v] of Object.entries(src)) if (v) pro[g] = 1;
    const on = Object.assign({}, newerB ? A.on : B.on, newerB ? B.on : A.on);
    return { got, n, pro, on };
  }
  // the career: the account's counters plus what's here that it hasn't had (d.add), the maxima the higher, the best runs the better
  function careerFrom(row: any): CareerStats {
    const s: any = G.Career.clean(null);
    if (!row) return s;
    for (const [k, col] of Object.entries(G.Career.COLS)) s[k] = +row[col] || 0;
    s.deepest = +row.deepest || 0; s.bestLevel = row.best_level || null; s.bestCredits = row.best_credits || null;
    return s;
  }
  function careerPlus(c: CareerStats, d: CloudQueue): CareerStats {
    const s: any = Object.assign({}, c);
    for (const [k, n] of Object.entries(d.add)) if (k in G.Career.COLS) s[k] = (s[k] || 0) + n;
    s.deepest = Math.max(s.deepest, d.max.deepest || 0);
    if (d.best.best_level && (!s.bestLevel || d.best.best_level.lvl > s.bestLevel.lvl)) s.bestLevel = d.best.best_level;
    if (d.best.best_credits && (!s.bestCredits || d.best.best_credits.credits > s.bestCredits.credits)) s.bestCredits = d.best.best_credits;
    return s;
  }
  // everything here, as a delta to add to an account that's never had it
  function careerAsDelta(s: CareerStats): CloudQueue {
    const d: CloudQueue = { add: {}, max: {}, best: {}, profile: 0, progress: 0 };
    for (const k of Object.keys(G.Career.COLS)) if ((s as any)[k]) d.add[k] = (s as any)[k];
    if (s.deepest) d.max.deepest = s.deepest;
    if (s.bestLevel) d.best.best_level = s.bestLevel;
    if (s.bestCredits) d.best.best_credits = s.bestCredits;
    return d;
  }
  const rpcDelta = (d: CloudQueue) => {
    const a: Record<string, number> = {};
    for (const [k, n] of Object.entries(d.add)) if (G.Career.COLS[k] && n > 0) a[G.Career.COLS[k]] = Math.round(n);
    return { add: a, max: d.max, best_level: d.best.best_level || null, best_credits: d.best.best_credits || null };
  };
  // a run, as its row (and back)
  const iso = (t: number | null) => (t ? new Date(t).toISOString() : null);
  const runRow = (r: CareerRun, uid: string) => ({ user_id: uid, id: r.id, started_at: iso(r.start), ended_at: r.end && r.end >= r.start ? iso(r.end) : null, solo: !!r.solo, host: !!r.host,
    squad: Math.max(1, Math.min(16, r.squad | 0)), joined_at: r.joined ? Math.max(1, Math.min(10000, r.joined | 0)) : null, outcome: r.outcome, deepest: Math.min(10000, r.deepest | 0),
    credits: Math.round(r.credits) || 0, kills: Math.min(100000, r.kills | 0), arrests: Math.min(100000, r.arrests | 0), levels: r.levels.slice(-200), schema_version: V });
  const runFrom = (w: any): CareerRun => ({ id: w.id, v: w.schema_version || 1, start: Date.parse(w.started_at), end: w.ended_at ? Date.parse(w.ended_at) : null, solo: !!w.solo, host: !!w.host, squad: w.squad || 1,
    joined: w.joined_at || null, outcome: w.outcome, deepest: w.deepest || 0, credits: w.credits || 0, kills: w.kills || 0, arrests: w.arrests || 0, levels: Array.isArray(w.levels) ? w.levels : [],
    t: Date.parse(w.updated_at || w.ended_at || w.started_at) || 0, u: 1, sy: 1 });

  // ------------------------------------------------------------- the client and the session
  const isAnon = (u: SbUser | null) => !!(u && (u.is_anonymous || (!u.email && !u.phone)));
  const redirect = () => location.origin + location.pathname;
  function load(): Promise<SbClient | null> {
    if (loading) return loading;
    setState('loading');
    loading = (async () => {
      const c = config(), opts = { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' as const } };
      const fake = (window as any).__bpCloudClient; // (a stand-in, for the tests: tools/cloud.test.mjs)
      const cl: SbClient = fake ? fake(c.url, c.key, opts) : (await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm')).createClient(c.url, c.key, opts);
      client = cl;
      cl.auth.onAuthStateChange((ev, session) => { const e = epoch; setTimeout(() => { if (e === epoch) authChanged(ev, session ? session.user : null); }, 0); }); // (an event from before a sign-in or out that's happened since: stale, ignored) // (not inside the callback: supabase-js's own lock is held there)
      const { data, error } = await cl.auth.getSession();
      if (error) throw error;
      if (data.session) await setUser(data.session.user);
      else setState('idle');
      return cl;
    })().catch((e) => { loading = null; fail(e, 'load'); return null; });
    return loading;
  }
  async function setUser(u: SbUser | null) {
    const was = user;
    if ((was ? was.id : null) !== (u ? u.id : null)) switched();
    user = u;
    if (!u) { setState(on() ? 'idle' : 'off'); return; }
    // an anonymous session an earlier version made: let go of (this browser's copy stays, and merges into your account when you sign
    // in with an email: it's a guest's, sync's adopt); the project's cleanup deletes the user in time
    if (isAnon(u)) { user = null; try { await client!.auth.signOut({ scope: 'local' }); } catch (e) { /* (gone from here regardless) */ } setState('idle'); tellHost(); return; }
    if (was && was.id === u.id) { render(); tellHost(); return; } // (the same user: an email confirmed, a token refreshed)
    tellHost();
    await sync();
  }
  function authChanged(ev: string, u: SbUser | null) {
    if (ev === 'SIGNED_OUT') { if (user) { switched(); user = null; render(); tellHost(); } return; }
    if (u && (!user || user.id !== u.id)) { setUser(u); return; }
    if (u) { const was = user && user.email; user = u; if (u.email !== was) { render(); tellHost(); } }
  }
  // the guest mark the squad sees (js/server.ts 'acct'), if you're in a game
  function tellHost() { render(); if (G.Net && G.Net.peer && G.Game && G.Game.phase !== 'menu') G.Net.toHost({ t: 'acct', anon: guest() ? 1 : 0 }); }
  // (GUEST, to the squad: cloud saves on, and not signed in. Off or not set up: nothing to say)
  const guest = () => on() && !(user && !isAnon(user));

  // ------------------------------------------------------------- reading and writing the rows
  async function must<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> { const { data, error } = await p; if (error) throw error; return data; }
  const one = (t: string, uid: string) => must(client!.from(t).select('*').eq('user_id', uid).maybeSingle());
  // the profile or progress row: pulled, merged with what's here, what changed here written in, what's newer here written up
  async function syncDoc(table: 'profiles' | 'progress', uid: string, mode: 'same' | 'adopt' | 'replace') {
    alive(uid);
    const row: any = await one(table, uid);
    alive(uid);
    const m = meta(), cmt: Record<string, number> = (row && row.mt) || {}, local: Record<string, any> = {};
    let changed: string[] = [], up = false;
    const out: any = { user_id: uid, schema_version: V };
    if (table === 'profiles') {
      for (const k of PREFS) { const v = S.get(k, undefined); if (v !== undefined) local[k] = v; }
      const cv: Record<string, any> = Object.assign({}, row ? row.settings : {}); for (const k of PROFILE) if (row && row[k] != null) cv[k] = row[k];
      // (a row an older version wrote: its one animal (the column) and second choice (settings.animal2), as the list's first entries)
      const oldAnimals = !!row && !Array.isArray(cv.animals) && (typeof row.animal === 'string' || typeof cv.animal2 === 'string');
      if (oldAnimals) { cv.animals = [row.animal, cv.animal2].filter((a, i, l) => typeof a === 'string' && a && l.indexOf(a) === i); cmt.animals = Math.max(cmt.animal || 0, cmt.animal2 || 0); }
      // (a shorter list, an older one or a top three: the missing animals appended in their usual order, and written up whole)
      const ids: string[] = G.Callsigns ? G.Callsigns.LIST.map((a) => a.id) : Array.isArray(local.animals) ? local.animals : [];
      const whole = (l: unknown) => { if (!Array.isArray(l)) return l; const o = l.filter((a, i) => typeof a === 'string' && l.indexOf(a) === i && (!G.Callsigns || G.Callsigns.valid(a))); for (const id of ids) if (!o.includes(id)) o.push(id); return o; };
      const shortCloud = Array.isArray(cv.animals) && JSON.stringify(whole(cv.animals)) !== JSON.stringify(cv.animals);
      if (shortCloud) cv.animals = whole(cv.animals);
      if (Array.isArray(local.animals)) local.animals = whole(local.animals);
      const r = mergePrefs(PREFS, local, m.mt, cv, cmt);
      for (const k of r.toLocal) { S.put(k, r.vals[k]); m.mt[k] = r.mt[k]; }
      // (a row holding what's no longer synced, a TURN password an older version wrote, is written again without it)
      const stale = !!row && Object.keys(row.settings || {}).some((k) => !SETTINGS.includes(k));
      changed = r.toLocal; up = r.toCloud || !row || stale || oldAnimals || shortCloud;
      const settings: Record<string, any> = {}; for (const k of SETTINGS) if (r.vals[k] !== undefined) settings[k] = r.vals[k];
      const first = Array.isArray(r.vals.animals) ? r.vals.animals[0] : null; // (the animal column: the 1st, for anything reading it)
      Object.assign(out, { name: r.vals.name != null ? String(r.vals.name).slice(0, 32) : null, animal: typeof first === 'string' ? first.slice(0, 32) : null, look: r.vals.look || null, settings, mt: r.mt });
    } else {
      const la = S.get('arsenal', null), lw = S.get('wishlist', undefined), ca = row ? row.arsenal : null;
      const arsenal = mode === 'replace' ? (ca && ca.got ? ca : { got: [], n: {}, pro: {}, on: {} }) : mergeArsenal(la, ca, (cmt.arsenal || 0) > (m.mt.arsenal || 0));
      const w = mode === 'replace' ? { vals: { wishlist: row ? row.wishlist : [] }, mt: { wishlist: cmt.wishlist || 0 }, toLocal: ['wishlist'], toCloud: false }
        : mergePrefs(['wishlist'], lw === undefined ? {} : { wishlist: lw }, m.mt, row ? { wishlist: row.wishlist } : {}, cmt);
      if (mode !== 'adopt') { // (moving a guest save: it isn't written into; the merge goes up, and the account's copy comes down once it's all confirmed)
        if (JSON.stringify(arsenal) !== JSON.stringify(la || null) && (la || arsenal.got.length || Object.keys(arsenal.n).length)) { S.put('arsenal', arsenal); changed.push('arsenal'); }
        if (w.toLocal.length && w.vals.wishlist !== undefined) { S.put('wishlist', w.vals.wishlist); m.mt.wishlist = w.mt.wishlist || 0; changed.push('wishlist'); }
      }
      const mt = { arsenal: Math.max(m.mt.arsenal || 0, cmt.arsenal || 0), wishlist: w.mt.wishlist || 0 };
      up = !row || JSON.stringify(arsenal) !== JSON.stringify(ca) || w.toCloud;
      Object.assign(out, { arsenal, wishlist: Array.isArray(w.vals.wishlist) ? w.vals.wishlist.slice(0, 500) : [], mt });
    }
    keepMeta();
    if (changed.length) applyLive(changed);
    if (up) { alive(uid); await must(client!.from(table).upsert(out, { onConflict: 'user_id' })); }
  }
  // what's merged in, into the game as it is now (the menu's controls, the arsenal's copy, the wishlist, the quick slots)
  function applyLive(keys: string[]) {
    if (keys.includes('arsenal') && G.Arsenal) G.Arsenal.reload();
    if (keys.includes('wishlist') && G.Shop) G.Shop.wishSet = null;
    if (keys.includes('quick') && G.Me) (G.Me as any)._quick = null;
    if (G.Game && G.Game.applyStored) G.Game.applyStored(keys);
  }
  // Signing in. A copy of this account: pulled, merged, pushed. A copy of no account (a guest save, or an anonymous user's from an
  // earlier build): moved into the account (migrate). A copy of another email account: replaced by this one's.
  async function sync() {
    if (!user || !client) return;
    if (busy) { again = true; return; }
    busy = true; setState('syncing');
    const uid = user.id;
    try {
      const m = meta(), mode: 'same' | 'adopt' | 'replace' = m.owner === uid ? 'same' : !m.owner || m.ownerAnon ? 'adopt' : 'replace';
      await unstash(uid); // (this account's unsent work from before it signed out here: up first)
      if (mode === 'adopt') { await migrate(uid); ok(); return; }
      const [crow, runs] = await Promise.all([one('career', uid), must(client.from('runs').select('*').eq('user_id', uid).order('started_at', { ascending: false }).limit(20))]);
      await syncDoc('profiles', uid, mode);
      await syncDoc('progress', uid, mode);
      alive(uid);
      if (mode === 'replace') stash(m.owner); // (the other account's unsent work: kept for it, not sent to this one)
      G.Career.setStats(careerPlus(careerFrom(crow), pendingOf(uid)));
      const recs = (runs as any[]).map(runFrom);
      if (mode === 'replace') G.Career.onlyRuns(recs); else G.Career.mergeRuns(recs);
      m.owner = uid; m.ownerAnon = isAnon(user); keepMeta();
      await sendCareer(uid);
      await pushRuns(uid);
      ok();
    } catch (e) { if (e !== SWITCHED && user && user.id === uid) fail(e, 'sync'); /* (signed in or out meanwhile: this was for the one before) */ } finally { busy = false; if (again) { again = false; schedule(0); } }
  }
  // Moving a guest save into an account: its preferences and progress merged and written, its career added (once: by an id the server
  // remembers), every run sent; only when the server has confirmed all of it is the guest save wiped and the account's copy taken in
  // its place. Until then the guest save is as it was (played on, it grows, and the next attempt carries the rest), and an attempt
  // that fails (offline, an error, a closed tab) is taken up again where it stopped.
  async function migrate(uid: string) {
    const m = meta();
    if (m.mig !== uid) { m.mig = uid; m.migSent = {}; keepMeta(); G.Career.unsyncAll(); }
    render();
    await sendFlying(uid); // (an addition sent before a reload, its reply never seen)
    for (let pass = 0; pass < 4; pass++) {
      const x = Q(), pf = x.profile, pg = x.progress; x.profile = 0; x.progress = 0; keepQ();
      try { await syncDoc('profiles', uid, 'adopt'); await syncDoc('progress', uid, 'adopt'); } catch (e) { const y = Q(); y.profile = y.profile || pf; y.progress = y.progress || pg; if (!pass) { y.profile = 1; y.progress = 1; } keepQ(); throw e; }
      const d = migDelta(uid);
      if (d) { const rec: CloudFly = { id: uuid(), uid, d, mig: true }; fly().push(rec); keepFly(); await sendRec(rec); }
      await pushRuns(uid);
      const y = Q(); if (!y.profile && !y.progress && !migDelta(uid) && !G.Career.runs().some((r) => r.sy !== r.u)) break;
    }
    alive(uid);
    // all confirmed: the account's copy, read back, in place of the guest save
    const snap = G.Career.stats(), snapA = careerAsDelta(snap).add;
    const [crow, prow, runs] = await Promise.all([one('career', uid), one('progress', uid), must(client!.from('runs').select('*').eq('user_id', uid).order('started_at', { ascending: false }).limit(20))]);
    alive(uid);
    const now = careerAsDelta(G.Career.stats()).add, extra: Record<string, number> = {}; // (played while it was read back: still to add)
    for (const [k, n] of Object.entries(now)) if (n - (snapA[k] || 0) > 0) extra[k] = n - (snapA[k] || 0);
    const pr: any = prow || {};
    S.put('arsenal', pr.arsenal && pr.arsenal.got ? pr.arsenal : undefined); S.put('wishlist', Array.isArray(pr.wishlist) ? pr.wishlist : undefined);
    m.mt.arsenal = (pr.mt && pr.mt.arsenal) || 0; m.mt.wishlist = (pr.mt && pr.mt.wishlist) || 0;
    m.owner = uid; m.ownerAnon = false; m.mig = null; m.migSent = {}; keepMeta();
    queueV = { add: {}, max: {}, best: {}, profile: 0, progress: 0 }; keepQ();
    G.Career.setStats(careerFrom(crow)); G.Career.onlyRuns((runs as any[]).map(runFrom));
    if (Object.keys(extra).length) add(extra);
    applyLive(['arsenal', 'wishlist']);
  }
  // what of the guest's career the account hasn't had yet: its totals, less what's confirmed and what's in flight
  function migDelta(uid: string): CloudQueue | null {
    const all = careerAsDelta(G.Career.stats()), sent: Record<string, number> = Object.assign({}, meta().migSent);
    for (const r of fly()) if (r.mig && r.uid === uid) for (const [k, n] of Object.entries(r.d.add)) sent[k] = (sent[k] || 0) + n;
    const d: CloudQueue = { add: {}, max: all.max, best: all.best, profile: 0, progress: 0 };
    for (const [k, n] of Object.entries(all.add)) if (n - (sent[k] || 0) > 0) d.add[k] = n - (sent[k] || 0);
    const maxima = Object.keys(d.max).length + Object.keys(d.best).length > 0; // (sent once with a move; __max: they have been)
    return Object.keys(d.add).length || (maxima && !meta().migSent.__max) ? d : null;
  }
  // one addition, by its id: sent, and once confirmed, forgotten (and, a move's, counted as moved)
  async function sendRec(rec: CloudFly) {
    alive(rec.uid); // (an addition is its account's: never sent under another's session)
    const row = await must(client!.rpc('career_add', { d: Object.assign(rpcDelta(rec.d), { id: rec.id }) }));
    const l = fly(), i = l.findIndex((r) => r.id === rec.id); if (i >= 0) { l.splice(i, 1); keepFly(); }
    if (rec.mig) { const m = meta(); for (const [k, n] of Object.entries(rec.d.add)) m.migSent[k] = (m.migSent[k] || 0) + n; m.migSent.__max = 1; keepMeta(); }
    else if (meta().owner === rec.uid) G.Career.setStats(careerPlus(careerFrom(Array.isArray(row) ? row[0] : row), pendingOf(rec.uid))); // (the account's, and what's still to come; not into a guest save being moved, whose career is its own)
  }
  async function sendFlying(uid: string) { for (const r of fly().filter((q) => q.uid === uid)) await sendRec(r); }
  // the queue's additions into flight (persisted first, then sent), and everything in flight for this account
  async function sendCareer(uid: string) {
    const x = Q();
    if (careerPending(x)) { fly().push({ id: uuid(), uid, d: { add: x.add, max: x.max, best: x.best, profile: 0, progress: 0 }, mig: false }); keepFly(); x.add = {}; x.max = {}; x.best = {}; keepQ(); }
    await sendFlying(uid);
  }
  // An account's unsent work, set aside as it signs out (or as another account's copy replaces this one): its queued career additions
  // become in-flight records of its own (sent only under its session), its changed progress and unsent runs go to bp_cloudstash.
  function stash(uid: string | null) {
    if (!uid) return;
    const x = Q();
    if (careerPending(x)) { fly().push({ id: uuid(), uid, d: { add: x.add, max: x.max, best: x.best, profile: 0, progress: 0 }, mig: false }); keepFly(); }
    const runs = G.Career.runs().filter((r) => r.sy !== r.u), st = S.get('cloudstash', {}) || {};
    if (x.progress || runs.length) { const o = st[uid] || {}; st[uid] = { arsenal: x.progress ? S.get('arsenal', null) : o.arsenal || null, wishlist: x.progress ? S.get('wishlist', null) : o.wishlist || null, runs: [...(o.runs || []), ...runs].slice(-200) }; S.put('cloudstash', st); }
    queueV = { add: {}, max: {}, best: {}, profile: 0, progress: 0 }; keepQ();
  }
  // ...and sent once it's back: its progress merged into the account's (unions, maxima), its runs upserted
  async function unstash(uid: string) {
    const st = S.get('cloudstash', {}) || {}, o = st[uid];
    if (!o) return;
    if (o.arsenal || o.wishlist) {
      const row: any = await one('progress', uid); alive(uid);
      const arsenal = mergeArsenal(o.arsenal, row ? row.arsenal : null, true), wl = Array.isArray(o.wishlist) ? o.wishlist : row ? row.wishlist : [];
      alive(uid); await must(client!.from('progress').upsert({ user_id: uid, schema_version: V, arsenal, wishlist: wl, mt: (row && row.mt) || {} }, { onConflict: 'user_id' }));
    }
    if (o.runs && o.runs.length) { alive(uid); await must(client!.from('runs').upsert(o.runs.map((r: CareerRun) => runRow(r, uid)), { onConflict: 'user_id,id' })); }
    const now = S.get('cloudstash', {}) || {}; delete now[uid]; S.put('cloudstash', now);
  }
  // what's here the account hasn't confirmed: the queue, and the additions in flight
  function pendingOf(uid: string): CloudQueue {
    const p: CloudQueue = { add: Object.assign({}, Q().add), max: Object.assign({}, Q().max), best: Object.assign({}, Q().best), profile: 0, progress: 0 };
    for (const r of fly()) if (!r.mig && r.uid === uid) { for (const [k, n] of Object.entries(r.d.add)) p.add[k] = (p.add[k] || 0) + n; for (const [k, n] of Object.entries(r.d.max)) p.max[k] = Math.max(p.max[k] || 0, n); }
    return p;
  }
  async function pushRuns(uid: string) {
    for (let i = 0; i < 40; i++) {
      const dirty = G.Career.runs().filter((r) => r.sy !== r.u).slice(0, BATCH);
      if (!dirty.length) return;
      const ver = dirty.map((r) => [r.id, r.u] as [string, number]);
        alive(uid);
      await must(client!.from('runs').upsert(dirty.map((r) => runRow(r, uid)), { onConflict: 'user_id,id' }));
      for (const [id, u] of ver) G.Career.markSynced(id, u);
    }
  }
  // the queue, sent: the changed rows (pulled and merged first, so another device's changes aren't written over), the career's
  // additions (each by its id), the runs
  async function flush() {
    if (!on() || !user || !client) return;
    if (busy) { again = true; return; }
    if (navigator.onLine === false) { setState('offline'); return; }
    busy = true;
    const uid = user.id, x = Q();
    try {
      if (meta().owner !== uid) { busy = false; return sync(); }
      if (x.profile) { x.profile = 0; keepQ(); try { await syncDoc('profiles', uid, 'same'); } catch (e) { Q().profile = 1; keepQ(); throw e; } }
      if (x.progress) { x.progress = 0; keepQ(); try { await syncDoc('progress', uid, 'same'); } catch (e) { Q().progress = 1; keepQ(); throw e; } }
      await sendCareer(uid);
      await pushRuns(uid);
      ok();
    } catch (e) { if (e !== SWITCHED && user && user.id === uid) fail(e, 'flush'); } finally { busy = false; if (again) { again = false; schedule(500); } }
  }  function ok() { retryMs = RETRY0; lastOk = Date.now(); why = ''; setState('ok'); const x = Q(); if (x.profile || x.progress || careerPending(x) || (user && fly().some((r) => r.uid === user!.id)) || G.Career.runs().some((r) => r.sy !== r.u)) schedule(); }
  function fail(e: any, where: string) {
    const msg = (e && (e.message || e.error_description || e.msg)) || String(e);
    const net = navigator.onLine === false || /fetch|network|load failed|timed? ?out|ECONN|offline/i.test(msg) || (e && (e.status === 0 || e.name === 'AuthRetryableFetchError'));
    why = net ? '' : msg;
    setState(net ? 'offline' : 'error');
    if (!net) console.warn('cloud: ' + where + ': ' + msg);
    clearTimeout(timer);
    const for_ = user ? user.id : null;
    timer = setTimeout(() => { if (for_) { if (user && user.id === for_) flush(); } else if (!client) { loading = null; load(); } }, retryMs);
    retryMs = Math.min(RETRY_MAX, retryMs * 2);
  }
  function setState(s: CloudState) { state = s; render(); }

  // ------------------------------------------------------------- email: sign in with one (made if it's new), sign out
  async function signInEmail(email: string) {
    const cl = await load();
    if (!cl) throw new Error(why || 'No connection to the save server');
    if (user) await flush();
    const { error } = await cl.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect(), shouldCreateUser: true } });
    if (error) throw error;
    mail = { email };
  }
  // the code in the email, instead of its link (a desktop game whose mail opens in another browser)
  async function verifyCode(code: string) {
    if (!client || !mail) return;
    const { data, error } = await client.auth.verifyOtp({ email: mail.email, token: code.trim(), type: 'email' });
    if (error) throw error;
    mail = null;
    if (data.user) authChanged('USER_UPDATED', data.user);
  }
  async function signOut() {
    if (!client) return;
    try { await flush(); } catch (e) { /* (queued: it's this account's, sent next time it signs in here) */ }
    const was = user ? user.id : null, m = meta();
    const { error } = await client.auth.signOut();
    if (error) throw error;
    switched(); user = null;
    if (was && m.owner === was) stash(was); // (what didn't go up: kept for this account, sent when it signs in again, never to another)
    // (a guest save still being moved in, not yet confirmed: it stays as it is, and the move picks up where it was if you sign in
    // to the same account again)
    if (m.owner !== was) { setState('idle'); tellHost(); return; }
    // this browser's copy of the account's progress goes (the account keeps it): an empty guest save; your preferences stay
    S.put('arsenal', undefined); S.put('wishlist', undefined); G.Career.reset();
    queueV = { add: {}, max: {}, best: {}, profile: 0, progress: 0 }; keepQ();
    m.owner = null; m.ownerAnon = false; m.mig = null; m.migSent = {}; delete m.mt.arsenal; delete m.mt.wishlist; keepMeta();
    applyLive(['arsenal', 'wishlist']);
    setState('idle'); tellHost();
  }

  // ------------------------------------------------------------- the menu's Account box
  function render() {
    const sum = document.getElementById('acctSum'), body = document.getElementById('acctBody');
    if (!sum || !body) return;
    const esc = G.U.esc, st = statusLine();
    let s = '', b = '';
    if (!configured()) { s = 'Not set up'; b = `<p>Cloud saves aren't set up for this copy of the game. Your progress is saved in this browser.</p>`; }
    else if (switchedOff()) { s = 'Off'; b = `<p>Cloud saves are off for this visit (<code>?cloud=0</code>). Your progress is saved in this browser.</p>`; }
    else if (!user) {
      s = state === 'loading' ? 'Connecting...' : 'Not signed in';
      b = `<p>Not signed in: progress saved on this device. Sign in with email to keep it everywhere.</p>${emailForm()}`;
    } else {
      const moving = meta().mig === user.id && meta().owner !== user.id, stuck = moving && (state === 'offline' || state === 'error');
      s = esc(user.email || 'Signed in') + (moving ? ' <span class="acct-st">· moving your progress</span>' : '');
      b = `<p>Signed in as <b>${esc(user.email || '')}</b>. ${moving ? `Moving your progress to your account…${stuck ? ' will retry.' : ''} (It stays on this device until that's done.)` : 'Your progress is saved to your account.'}</p><div class="acct-row"><button class="btn small" data-acct="out">Sign out</button></div>`;
    }
    sum.innerHTML = s + (st.short ? ` <span class="acct-st ${st.bad ? 'bad' : ''}">· ${st.short}</span>` : '');
    const tail = (st.long ? `<div class="acct-status${st.bad ? ' bad' : ''}">${esc(st.long)}</div>` : '') + (mailMsg ? `<div class="acct-msg${mailErr ? ' bad' : ''}">${esc(mailMsg)}</div>` : '');
    paint(body, b + tail);
    // the offer to register (offer): its form, the same; gone once you're signed in
    const ob = document.getElementById('regBody');
    if (offerOpen && user && !isAnon(user)) hideOffer();
    else if (ob && offerOpen) paint(ob, emailForm('reg') + tail);
  }
  // (drawn again, what's being typed is kept, and where)
  function paint(el: HTMLElement, html: string) {
    const keep = [...el.querySelectorAll<HTMLInputElement>('input[id]')].map((i) => [i.id, i.value, document.activeElement === i] as [string, string, boolean]);
    el.innerHTML = html;
    for (const [id, v, had] of keep) { const i = el.querySelector<HTMLInputElement>('#' + id); if (!i) continue; i.value = v; if (had) i.focus(); }
  }
  function emailForm(p = 'acct') {
    if (mail) return `<p class="acct-sent"><b>Check your email.</b> We've sent a link to <b>${G.U.esc(mail.email)}</b>. Open it in this browser, or enter the code from the email:</p>
      <div class="acct-row"><input id="${p}Code" maxlength="10" placeholder="Code" autocomplete="one-time-code" inputmode="numeric"><button class="btn small" data-acct="code">Confirm</button><button class="btn small" data-acct="cancel">Back</button></div>`;
    return `<div class="acct-row"><input id="${p}Email" type="email" maxlength="254" placeholder="you@example.com" autocomplete="email"><button class="btn small" data-acct="signin">Sign in with email</button></div>
      <small class="dim">A link (and a code) by email, no password. A new email makes your account, and what's on this device goes into it.</small>`;
  }
  function statusLine(): { short: string; long: string; bad: boolean } {
    if (!on()) return { short: '', long: '', bad: false };
    if (state === 'offline') return navigator.onLine === false ? { short: 'offline', long: "Offline: your progress is saved here and goes up when you're back online.", bad: true }
      : { short: 'not reachable', long: "Can't reach the save server: your progress is saved here and goes up once it can.", bad: true };
    if (state === 'error') return { short: 'sync failed', long: 'Sync failed' + (why ? ': ' + why : '') + '. Saved here; retrying.', bad: true };
    if (state === 'syncing') return { short: '', long: 'Syncing...', bad: false };
    if (state === 'ok' && lastOk) return { short: '', long: 'Synced ' + new Date(lastOk).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }), bad: false };
    return { short: '', long: '', bad: false };
  }
  async function act(what: string, p = 'acct') {
    const em = (document.getElementById(p + 'Email') as HTMLInputElement | null), email = em ? em.value.trim() : '';
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    mailMsg = ''; mailErr = false;
    try {
      if (what === 'signin' && !valid) throw new Error('Enter your email address.');
      if (what === 'signin') await signInEmail(email);
      else if (what === 'code') { const c = document.getElementById(p + 'Code') as HTMLInputElement | null; await verifyCode(c ? c.value : ''); }
      else if (what === 'cancel') mail = null;
      else if (what === 'out') { if (confirm('Sign out? Your progress stays in your account, and leaves this browser until you sign in again.')) await signOut(); }
    } catch (e: any) { mailMsg = (e && e.message) || String(e); mailErr = true; }
    render();
    if (p === 'reg' && offerOpen) { const f = document.querySelector<HTMLInputElement>(mail ? '#regCode' : '#regEmail'); if (f) f.focus(); }
  }
  function bindForm(el: HTMLElement, p: string) {
    el.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-acct]'); if (b) act(b.dataset.acct!, p); });
    el.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; const t = e.target as HTMLElement; if (t.id === p + 'Code') act('code', p); else if (t.id === p + 'Email') act('signin', p); });
  }
  // ------------------------------------------------------------- the offer to register, as the main menu opens
  // Shown with cloud saves set up, not signed in (no session kept here either), not on a debug start (?play, ?hangar...) or a magic
  // link's way back, and not after "Don't show again" (bp_noOffer: this device's, not synced). The client isn't loaded for it until
  // you type an email: a guest who clicks through makes no request.
  let offerOpen = false;
  function showOffer() {
    const box = document.getElementById('regOffer'), menu = document.querySelector<HTMLElement>('#menu > .menu-box:not(.reg-offer)');
    if (!box || !menu) return;
    offerOpen = true; mailMsg = ''; mailErr = false;
    menu.classList.add('hidden'); box.classList.remove('hidden');
    paint(document.getElementById('regBody')!, emailForm('reg'));
    const f = document.getElementById('regEmail'); if (f) f.focus();
  }
  function hideOffer() {
    const box = document.getElementById('regOffer'), menu = document.querySelector<HTMLElement>('#menu > .menu-box:not(.reg-offer)');
    offerOpen = false;
    if (box) box.classList.add('hidden');
    if (menu) menu.classList.remove('hidden');
    render();
  }
  // Play as guest (or Esc): to the menu; "Don't show again" ticked, never again here
  function guestOn() {
    const never = document.getElementById('regNever') as HTMLInputElement | null;
    if (never && never.checked) S.put('noOffer', 1);
    hideOffer();
  }
  function bindOffer() {
    const box = document.getElementById('regOffer'), body = document.getElementById('regBody');
    if (!box || !body || box.dataset.bound) return;
    box.dataset.bound = '1';
    bindForm(body, 'reg');
    body.addEventListener('input', (e) => { if ((e.target as HTMLElement).id === 'regEmail' && on() && !loading) load(); }); // (typing an email: the client, from the CDN; nothing asked of the project yet)
    document.getElementById('regGuest')!.addEventListener('click', guestOn);
    document.addEventListener('keydown', (e) => {
      if (!offerOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); guestOn(); return; }
      if (e.key !== 'Tab') return; // (focus kept in the panel while it's open)
      const f = [...box.querySelectorAll<HTMLElement>('input, button, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled') && x.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement), n = i < 0 && !e.shiftKey ? 0 : e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i >= f.length - 1 ? 0 : i + 1);
      e.preventDefault(); f[n].focus();
    });
  }
  function bindUI() {
    const body = document.getElementById('acctBody');
    if (!body || body.dataset.bound) return;
    body.dataset.bound = '1';
    bindForm(body, 'acct');
    bindOffer();
    // (the box opened: the client's wanted, to show who you are and to sign in)
    const det = document.getElementById('acctBox') as HTMLDetailsElement | null;
    if (det) det.addEventListener('toggle', () => { if (det.open && on() && !loading) load(); });
  }

  // ------------------------------------------------------------- starting
  function boot() {
    S.onSet = onSet;
    { const m = meta(); if (m.mt.animal != null || m.mt.animal2 != null) { m.mt.animals = Math.max(m.mt.animals || 0, m.mt.animal || 0, m.mt.animal2 || 0); delete m.mt.animal; delete m.mt.animal2; keepMeta(); } } // (an older version's one animal and second choice: now the list, js/game.ts animalPrefs)
    G.Career.init();
    bindUI(); render();
    if (!on()) { state = 'off'; render(); return; }
    state = 'idle';
    window.addEventListener('online', () => { retryMs = RETRY0; if (user) flush(); });
    window.addEventListener('offline', () => setState('offline'));
    window.addEventListener('pagehide', () => { if (user) flush(); });
    // The client loads only if there's a session to restore (supabase-js keeps it under sb-<project>-auth-token), once the page is in
    // and idle (it mustn't hold up the first paint or the models), or at once if this is a magic link's way back in (its session in
    // the URL's hash). Otherwise when the Account box is opened (bindUI): someone who never signs in makes no request at all.
    const back = /access_token=|error_description=|[?&]code=/.test(location.hash + location.search);
    const stored = () => { try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i) || ''; if (/^sb-.+-auth-token$/.test(k)) return true; } } catch (e) { /* storage unavailable */ } return false; };
    const go = () => { if (back || stored()) load(); };
    const dbg = ['play', 'hangar', 'demo'].some((k) => q.has(k));
    if (!back && !stored() && !dbg && !S.get('noOffer', 0)) showOffer();
    if (back) go();
    else if (document.readyState === 'complete') setTimeout(go, 1500);
    else window.addEventListener('load', () => setTimeout(go, 1500));
  }

  return { boot, add, runChanged, flush, sync, signInEmail, showOffer, hideOffer, get offerOpen() { return offerOpen; }, verifyCode, signOut, render,
    mergePrefs, mergeArsenal, careerPlus, careerAsDelta, careerFrom,
    on, configured, guest, queue: () => Q(), meta: () => meta(), fly: () => fly(), tune(o: { batch?: number }) { if (o.batch) BATCH = o.batch; },
    get state() { return state; }, get user() { return user; }, get client() { return client; } };
})();
G.Cloud = G_Cloud;

interface GameModules { Cloud: typeof G_Cloud; }
