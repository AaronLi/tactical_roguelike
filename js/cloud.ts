'use strict';
// Cloud saves (docs/cloud.md): your progress in a Supabase project, so it survives a cleared browser and follows you to another
// device. What's kept: the sidearm tree (G.U.store 'arsenal'), your callsign, look and settings, the wishlist, the career and the
// run log (js/career.ts). It all lives in this browser first, as it always has (G.U.store, under bp_); this copies it up and back.
//   - Not set up (js/cloudconfig.ts empty) or ?cloud=0: nothing happens here past drawing the menu's Account box. No request.
//   - Set up: the Supabase client loads from the CDN once the page is in (never in the simulation's thread). You start as a
//     guest, an anonymous Supabase user, made the first time there's something to save; "Save to email" links an email to that
//     same user (a magic link, or its code), "Sign in with email" brings an account onto another browser.
//   - Changes are written a few seconds after they're made (debounced), queued while offline (bp_cloudq) and sent when back.
//   - On signing in, what's here merges with what the account has (merge rules: docs/cloud.md, and the functions below).
// The page only: the server worker never loads this file (docs/threads.md).
type CloudState = 'off' | 'idle' | 'loading' | 'ok' | 'syncing' | 'offline' | 'error';
type SbClient = import('@supabase/supabase-js').SupabaseClient;
type SbUser = import('@supabase/supabase-js').User;
interface CloudMeta { v: number; owner: string | null; ownerAnon: boolean; mt: Record<string, number> }
interface CloudQueue { add: Record<string, number>; max: Record<string, number>; best: Record<string, CareerBest>; profile: number; progress: number }
const G_Cloud = (() => {
  const V = 1; // (the data's shape: schema_version in every row. The client's version is in load's import, and js/types/supabase-cdn.d.ts)
  // what's synced, by where it goes (never the TURN relay's settings, 'turn': a connection's credentials stay in this browser): the profile row's columns, its settings (jsonb), and the progress row
  const PROFILE = ['name', 'animal', 'look'], SETTINGS = ['animal2', 'sens', 'fov', 'vol', 'loadKit', 'muted', 'quick'], PROGRESS = ['arsenal', 'wishlist'];
  const PREFS = [...PROFILE, ...SETTINGS], SYNCED = new Set([...PREFS, ...PROGRESS]);
  const DEBOUNCE = 4000, RETRY0 = 5000, RETRY_MAX = 60000;
  const q = new URLSearchParams(location.search);
  let state: CloudState = 'off', why = '', client: SbClient | null = null, user: SbUser | null = null, loading: Promise<SbClient | null> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined, retryMs = RETRY0, busy = false, again = false, signing: Promise<void> | null = null, lastOk = 0;
  let mail: { email: string; kind: 'link' | 'signin' } | null = null, mailMsg = '', mailErr = false;

  // ------------------------------------------------------------- config
  function config() {
    const o = (window as any).__bpCloudConfig, C = G.CloudConfig;
    return { url: String((o && o.url) || (C && C.SUPABASE_URL) || '').trim(), key: String((o && o.key) || (C && C.SUPABASE_ANON_KEY) || '').trim() };
  }
  const switchedOff = () => q.get('cloud') === '0';
  const configured = () => { const c = config(); return !!(c.url && c.key); };
  const on = () => configured() && !switchedOff();

  // ------------------------------------------------------------- what's kept here about the cloud
  const S = G.U.store;
  let metaV: CloudMeta | null = null, queueV: CloudQueue | null = null;
  function meta(): CloudMeta {
    if (!metaV) { const m = S.get('cloudmeta', null); metaV = { v: V, owner: m && typeof m.owner === 'string' ? m.owner : null, ownerAnon: !!(m && m.ownerAnon), mt: (m && m.mt && typeof m.mt === 'object') ? m.mt : {} }; }
    return metaV;
  }
  const keepMeta = () => S.put('cloudmeta', meta());
  function Q(): CloudQueue {
    if (!queueV) { const v = S.get('cloudq', null) || {}; queueV = { add: v.add || {}, max: v.max || {}, best: v.best || {}, profile: v.profile ? 1 : 0, progress: v.progress ? 1 : 0 }; }
    return queueV;
  }
  const keepQ = () => S.put('cloudq', Q());
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
    if (user) schedule(); else ensure();
  }
  function schedule(ms = DEBOUNCE) { clearTimeout(timer); timer = setTimeout(() => { flush(); }, ms); }

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
  function requeue(d: CloudQueue) { add(d.add, d.max, d.best); }
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
      cl.auth.onAuthStateChange((ev, session) => { setTimeout(() => authChanged(ev, session ? session.user : null), 0); }); // (not inside the callback: supabase-js's own lock is held there)
      const { data, error } = await cl.auth.getSession();
      if (error) throw error;
      if (data.session) await setUser(data.session.user);
      else if (hasSomething()) ensure();
      else setState('idle');
      return cl;
    })().catch((e) => { loading = null; fail(e, 'load'); return null; });
    return loading;
  }
  // anything here worth an account yet (a fresh visitor who looks at the menu and leaves makes no guest)
  function hasSomething() {
    const x = Q(), m = meta();
    return !!(G.Career.stats().runs || S.get('arsenal', null) || Object.values(m.mt).some((t) => t > 0) || x.profile || x.progress);
  }
  // a guest: an anonymous user, the first time there's something to save
  function ensure(): Promise<void> {
    if (!on() || user) return Promise.resolve();
    if (signing) return signing;
    signing = (async () => {
      const cl = await load();
      if (!cl || user) return;
      if (navigator.onLine === false) { setState('offline'); return; }
      const { data, error } = await cl.auth.signInAnonymously();
      if (error) throw error;
      if (data.user) await setUser(data.user);
    })().catch((e) => fail(e, 'guest')).finally(() => { signing = null; });
    return signing;
  }
  async function setUser(u: SbUser | null) {
    const was = user;
    user = u;
    if (!u) { setState(on() ? 'idle' : 'off'); return; }
    if (was && was.id === u.id) { render(); tellHost(); return; } // (the same user: an email confirmed, a token refreshed)
    tellHost();
    await sync();
  }
  function authChanged(ev: string, u: SbUser | null) {
    if (ev === 'SIGNED_OUT') { user = null; render(); tellHost(); return; }
    if (u && (!user || user.id !== u.id)) { setUser(u); return; }
    if (u && user && (u.email !== user.email || isAnon(u) !== isAnon(user))) {
      const wasAnon = isAnon(user); user = u;
      if (wasAnon && !isAnon(u)) { mail = null; mailMsg = 'Saved to ' + (u.email || 'your email') + '.'; mailErr = false; meta().ownerAnon = false; keepMeta(); }
      render(); tellHost();
    } else if (u) user = u;
  }
  // the guest mark the squad sees (js/server.ts 'acct'), if you're in a game
  function tellHost() { render(); if (G.Net && G.Net.peer && G.Game && G.Game.phase !== 'menu') G.Net.toHost({ t: 'acct', anon: guest() ? 1 : 0 }); }
  const guest = () => on() && !!user && isAnon(user);

  // ------------------------------------------------------------- reading and writing the rows
  async function must<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> { const { data, error } = await p; if (error) throw error; return data; }
  const one = (t: string, uid: string) => must(client!.from(t).select('*').eq('user_id', uid).maybeSingle());
  // the profile or progress row: pulled, merged with what's here, what changed here written in, what's newer here written up
  async function syncDoc(table: 'profiles' | 'progress', uid: string, mode: 'same' | 'adopt' | 'replace') {
    const row: any = await one(table, uid);
    if (!user || user.id !== uid) return;
    const m = meta(), cmt: Record<string, number> = (row && row.mt) || {}, local: Record<string, any> = {};
    let changed: string[] = [], up = false;
    const out: any = { user_id: uid, schema_version: V };
    if (table === 'profiles') {
      for (const k of PREFS) { const v = S.get(k, undefined); if (v !== undefined) local[k] = v; }
      const cv: Record<string, any> = Object.assign({}, row ? row.settings : {}); for (const k of PROFILE) if (row && row[k] != null) cv[k] = row[k];
      const r = mergePrefs(PREFS, local, m.mt, cv, cmt);
      for (const k of r.toLocal) { S.put(k, r.vals[k]); m.mt[k] = r.mt[k]; }
      // (a row holding what's no longer synced, a TURN password an older version wrote, is written again without it)
      const stale = !!row && Object.keys(row.settings || {}).some((k) => !SETTINGS.includes(k));
      changed = r.toLocal; up = r.toCloud || !row || stale;
      const settings: Record<string, any> = {}; for (const k of SETTINGS) if (r.vals[k] !== undefined) settings[k] = r.vals[k];
      Object.assign(out, { name: r.vals.name != null ? String(r.vals.name).slice(0, 32) : null, animal: r.vals.animal != null ? String(r.vals.animal).slice(0, 32) : null, look: r.vals.look || null, settings, mt: r.mt });
    } else {
      const la = S.get('arsenal', null), lw = S.get('wishlist', undefined), ca = row ? row.arsenal : null;
      const arsenal = mode === 'replace' ? (ca && ca.got ? ca : { got: [], n: {}, pro: {}, on: {} }) : mergeArsenal(la, ca, (cmt.arsenal || 0) > (m.mt.arsenal || 0));
      const w = mode === 'replace' ? { vals: { wishlist: row ? row.wishlist : [] }, mt: { wishlist: cmt.wishlist || 0 }, toLocal: ['wishlist'], toCloud: false }
        : mergePrefs(['wishlist'], lw === undefined ? {} : { wishlist: lw }, m.mt, row ? { wishlist: row.wishlist } : {}, cmt);
      if (JSON.stringify(arsenal) !== JSON.stringify(la || null) && (la || arsenal.got.length || Object.keys(arsenal.n).length)) { S.put('arsenal', arsenal); changed.push('arsenal'); }
      if (w.toLocal.length && w.vals.wishlist !== undefined) { S.put('wishlist', w.vals.wishlist); m.mt.wishlist = w.mt.wishlist || 0; changed.push('wishlist'); }
      const mt = { arsenal: Math.max(m.mt.arsenal || 0, cmt.arsenal || 0), wishlist: w.mt.wishlist || 0 };
      up = !row || JSON.stringify(arsenal) !== JSON.stringify(ca) || w.toCloud;
      Object.assign(out, { arsenal, wishlist: Array.isArray(w.vals.wishlist) ? w.vals.wishlist.slice(0, 500) : [], mt });
    }
    keepMeta();
    if (changed.length) applyLive(changed);
    if (up) await must(client!.from(table).upsert(out, { onConflict: 'user_id' }));
  }
  // what's merged in, into the game as it is now (the menu's controls, the arsenal's copy, the wishlist, the quick slots)
  function applyLive(keys: string[]) {
    if (keys.includes('arsenal') && G.Arsenal) G.Arsenal.reload();
    if (keys.includes('wishlist') && G.Shop) G.Shop.wishSet = null;
    if (keys.includes('quick') && G.Me) (G.Me as any)._quick = null;
    if (G.Game && G.Game.applyStored) G.Game.applyStored(keys);
  }
  // signing in: everything pulled and merged, the career added to, the runs sent
  async function sync() {
    if (!user || !client) return;
    if (busy) { again = true; return; }
    busy = true; setState('syncing');
    const uid = user.id;
    try {
      const m = meta(), mode: 'same' | 'adopt' | 'replace' = m.owner === uid ? 'same' : !m.owner || m.ownerAnon ? 'adopt' : 'replace';
      const [crow, runs] = await Promise.all([one('career', uid), must(client.from('runs').select('*').eq('user_id', uid).order('started_at', { ascending: false }).limit(20))]);
      await syncDoc('profiles', uid, mode);
      await syncDoc('progress', uid, mode);
      if (!user || user.id !== uid) return;
      // (from here to the career's request, nothing waits: what happens meanwhile is queued for after)
      const x = Q(), d: CloudQueue = mode === 'same' ? { add: x.add, max: x.max, best: x.best, profile: 0, progress: 0 } : mode === 'adopt' ? careerAsDelta(G.Career.stats()) : { add: {}, max: {}, best: {}, profile: 0, progress: 0 };
      G.Career.setStats(careerPlus(careerFrom(crow), d));
      const recs = (runs as any[]).map(runFrom);
      if (mode === 'replace') G.Career.onlyRuns(recs); else { if (mode === 'adopt') G.Career.unsyncAll(); G.Career.mergeRuns(recs); }
      queueV = { add: {}, max: {}, best: {}, profile: 0, progress: 0 }; keepQ();
      m.owner = uid; m.ownerAnon = isAnon(user); keepMeta();
      if (careerPending(d)) await pushCareer(d);
      await pushRuns(uid);
      ok();
    } catch (e) { fail(e, 'sync'); } finally { busy = false; if (again) { again = false; schedule(0); } }
  }
  async function pushCareer(d: CloudQueue) {
    try {
      const row = await must(client!.rpc('career_add', { d: rpcDelta(d) }));
      G.Career.setStats(careerPlus(careerFrom(Array.isArray(row) ? row[0] : row), Q())); // (the account's, and what's come since)
    } catch (e) { requeue(d); throw e; }
  }
  async function pushRuns(uid: string) {
    const dirty = G.Career.runs().filter((r) => r.sy !== r.u).slice(0, 50);
    if (!dirty.length) return;
    const ver = dirty.map((r) => [r.id, r.u] as [string, number]);
    await must(client!.from('runs').upsert(dirty.map((r) => runRow(r, uid)), { onConflict: 'user_id,id' }));
    for (const [id, u] of ver) G.Career.markSynced(id, u);
  }
  // the queue, sent: the changed rows (pulled and merged first, so another device's changes aren't written over), the career's
  // additions, the runs
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
      if (careerPending(Q())) { const y = Q(), d: CloudQueue = { add: y.add, max: y.max, best: y.best, profile: 0, progress: 0 }; y.add = {}; y.max = {}; y.best = {}; keepQ(); await pushCareer(d); }
      await pushRuns(uid);
      ok();
    } catch (e) { fail(e, 'flush'); } finally { busy = false; if (again) { again = false; schedule(500); } }
  }
  function ok() { retryMs = RETRY0; lastOk = Date.now(); why = ''; setState('ok'); const x = Q(); if (x.profile || x.progress || careerPending(x) || G.Career.runs().some((r) => r.sy !== r.u)) schedule(); }
  function fail(e: any, where: string) {
    const msg = (e && (e.message || e.error_description || e.msg)) || String(e);
    const net = navigator.onLine === false || /fetch|network|load failed|timed? ?out|ECONN|offline/i.test(msg) || (e && (e.status === 0 || e.name === 'AuthRetryableFetchError'));
    why = net ? '' : msg;
    setState(net ? 'offline' : 'error');
    if (!net) console.warn('cloud: ' + where + ': ' + msg);
    clearTimeout(timer);
    timer = setTimeout(() => { if (user) flush(); else ensure(); }, retryMs);
    retryMs = Math.min(RETRY_MAX, retryMs * 2);
  }
  function setState(s: CloudState) { state = s; render(); }

  // ------------------------------------------------------------- email: save the guest to one, sign in with one, sign out
  async function saveEmail(email: string) {
    if (!client || !user) await ensure();
    if (!client || !user) throw new Error(state === 'offline' ? "You're offline" : why || 'No connection to the save server');
    if (isAnon(user)) {
      const { error } = await client.auth.updateUser({ email }, { emailRedirectTo: redirect() });
      if (error) throw error;
      mail = { email, kind: 'link' };
    } else await signInEmail(email);
  }
  async function signInEmail(email: string) {
    const cl = await load();
    if (!cl) throw new Error(why || 'No connection to the save server');
    if (user) await flush();
    const { error } = await cl.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect(), shouldCreateUser: true } });
    if (error) throw error;
    mail = { email, kind: 'signin' };
  }
  // the code in the email, instead of its link (a desktop game whose mail opens in another browser)
  async function verifyCode(code: string) {
    if (!client || !mail) return;
    const { data, error } = await client.auth.verifyOtp({ email: mail.email, token: code.trim(), type: mail.kind === 'link' ? 'email_change' : 'email' });
    if (error) throw error;
    mail = null;
    if (data.user) authChanged('USER_UPDATED', data.user);
  }
  async function signOut() {
    if (!client) return;
    try { await flush(); } catch (e) { /* (queued: it's this account's, sent next time it signs in here) */ }
    const { error } = await client.auth.signOut();
    if (error) throw error;
    user = null;
    // this browser's copy of the account's progress goes (the account keeps it); your preferences stay
    S.put('arsenal', undefined); S.put('wishlist', undefined); G.Career.reset();
    queueV = { add: {}, max: {}, best: {}, profile: 0, progress: 0 }; keepQ();
    const m = meta(); m.owner = null; m.ownerAnon = false; delete m.mt.arsenal; delete m.mt.wishlist; keepMeta();
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
      s = state === 'loading' ? 'Connecting...' : 'Saved in this browser';
      b = `<p>Your progress is saved in this browser. It goes to the cloud as a guest once there's something to save.</p>${emailForm('signin')}`;
    } else if (isAnon(user)) {
      s = 'Guest (progress saved)';
      b = `<p>Playing as a <b>guest</b>: your progress is saved to the cloud, for this browser. Save it to an email to keep it if this browser's data goes, or to play on another device.</p>${emailForm('link')}`;
    } else {
      s = esc(user.email || 'Signed in');
      b = `<p>Signed in as <b>${esc(user.email || '')}</b>. Your progress is saved to your account.</p><div class="acct-row"><button class="btn small" data-acct="out">Sign out</button></div>`;
    }
    sum.innerHTML = s + (st.short ? ` <span class="acct-st ${st.bad ? 'bad' : ''}">· ${st.short}</span>` : '');
    body.innerHTML = b + (st.long ? `<div class="acct-status${st.bad ? ' bad' : ''}">${esc(st.long)}</div>` : '') + (mailMsg ? `<div class="acct-msg${mailErr ? ' bad' : ''}">${esc(mailMsg)}</div>` : '');
  }
  function emailForm(kind: 'link' | 'signin') {
    if (mail) return `<p class="acct-sent">We've sent a link to <b>${G.U.esc(mail.email)}</b>. Open it in this browser, or enter the code from the email:</p>
      <div class="acct-row"><input id="acctCode" maxlength="10" placeholder="Code" autocomplete="one-time-code" inputmode="numeric"><button class="btn small" data-acct="code">Confirm</button><button class="btn small" data-acct="cancel">Back</button></div>`;
    return `<div class="acct-row"><input id="acctEmail" type="email" maxlength="254" placeholder="you@example.com" autocomplete="email">${kind === 'link' ? '<button class="btn small" data-acct="save">Save to email</button>' : ''}</div>
      <div class="acct-row acct-alt">${kind === 'link' ? '<small class="dim">Saved to an email before?</small>' : ''}<button class="btn small" data-acct="signin">Sign in with email</button></div>`;
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
  async function act(what: string) {
    const em = (document.getElementById('acctEmail') as HTMLInputElement | null), email = em ? em.value.trim() : '';
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    mailMsg = ''; mailErr = false;
    try {
      if ((what === 'save' || what === 'signin') && !valid) throw new Error('Enter your email address.');
      if (what === 'save') await saveEmail(email);
      else if (what === 'signin') await signInEmail(email);
      else if (what === 'code') { const c = document.getElementById('acctCode') as HTMLInputElement | null; await verifyCode(c ? c.value : ''); }
      else if (what === 'cancel') mail = null;
      else if (what === 'out') { if (confirm('Sign out? Your progress stays in your account, and leaves this browser until you sign in again.')) await signOut(); }
    } catch (e: any) { mailMsg = (e && e.message) || String(e); mailErr = true; }
    render();
  }
  function bindUI() {
    const body = document.getElementById('acctBody');
    if (!body || body.dataset.bound) return;
    body.dataset.bound = '1';
    body.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-acct]'); if (b) act(b.dataset.acct!); });
    body.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; const t = e.target as HTMLElement; if (t.id === 'acctCode') act('code'); else if (t.id === 'acctEmail') act(guest() ? 'save' : 'signin'); });
    // (the box opened: the client's wanted, to show who you are and to sign in)
    const det = document.getElementById('acctBox') as HTMLDetailsElement | null;
    if (det) det.addEventListener('toggle', () => { if (det.open && on() && !loading) load(); });
  }

  // ------------------------------------------------------------- starting
  function boot() {
    S.onSet = onSet;
    G.Career.init();
    bindUI(); render();
    if (!on()) { state = 'off'; render(); return; }
    state = 'idle';
    window.addEventListener('online', () => { retryMs = RETRY0; if (user) flush(); else if (hasSomething()) ensure(); });
    window.addEventListener('offline', () => setState('offline'));
    window.addEventListener('pagehide', () => { if (user) flush(); });
    // the client loads once the page is in and idle (it mustn't hold up the first paint or the models), at once if this is a
    // magic link's way back in (its session is in the URL's hash)
    const back = /access_token=|error_description=|[?&]code=/.test(location.hash + location.search);
    const go = () => { if (back || hasSomething() || meta().owner) load(); };
    if (back) go();
    else if (document.readyState === 'complete') setTimeout(go, 1500);
    else window.addEventListener('load', () => setTimeout(go, 1500));
  }

  return { boot, add, runChanged, flush, sync, ensure, saveEmail, signInEmail, verifyCode, signOut, render,
    mergePrefs, mergeArsenal, careerPlus, careerAsDelta, careerFrom,
    on, configured, guest, queue: () => Q(), meta: () => meta(),
    get state() { return state; }, get user() { return user; }, get client() { return client; } };
})();
G.Cloud = G_Cloud;

interface GameModules { Cloud: typeof G_Cloud; }
