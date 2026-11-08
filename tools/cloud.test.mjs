// The cloud saves, tested without a Supabase project (docs/cloud.md "Testing"): the migrations applied to a real Postgres in this
// process (tools/cloud_db.mjs), Row Level Security checked on it, and the game's own client code (dist/js/util.js, career.js,
// cloud.js, as the page runs them) driven against a stand-in for supabase-js over that database (tools/cloud_fake.mjs), in "browsers"
// that are each a fresh script context with their own localStorage (a reload: a new context on the same storage).
//   npm run test:cloud
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openDb } from './cloud_db.mjs';
import { fakeServer } from './cloud_fake.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = (f) => fs.readFileSync(path.join(ROOT, 'dist', 'js', f), 'utf8');
const SRC = ['util.js', 'cloudconfig.js', 'career.js', 'cloud.js'].map((f) => [f, JS(f)]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0, passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n     ')); }
}
function storage(map = new Map()) {
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), key: (i) => [...map.keys()][i] ?? null, get length() { return map.size; } };
}
// a browser: the game's scripts in a context of their own, on this storage, with the project set up (or not: cfg null)
function browser(server, store, { cfg = { url: 'http://fake.supabase', key: 'anon' }, search = '' } = {}) {
  const listeners = {};
  const win = {
    localStorage: store, sessionStorage: storage(), console, setTimeout, clearTimeout, setInterval, clearInterval, crypto, URLSearchParams, performance,
    location: { search, hash: '', origin: 'http://localhost:8080', pathname: '/' },
    navigator: { onLine: true },
    document: { readyState: 'complete', getElementById: () => null, querySelector: () => null },
    addEventListener: (ev, f) => { (listeners[ev] = listeners[ev] || []).push(f); },
    __bpCloudConfig: cfg || { url: '', key: '' }, // (null: no project, whatever js/cloudconfig.ts holds)
    __bpCloudClient: server ? (url, key, opts) => server.client(url, key, opts, store) : undefined,
    confirm: () => true,
  };
  win.window = win; win.self = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  for (const [f, s] of SRC) vm.runInContext(s, ctx, { filename: f });
  const G = win.G;
  // what the page's other files would have put there, as far as these touch it
  G.THEMES = [{ name: 'Warehouse' }, { name: 'Apartments' }];
  G.Route = { isBoss: (n) => n % 10 === 0 };
  G.Net = { solo: true, isHost: true, peer: null };
  G.Arsenal = { reload() {} };
  { const LIST = ['snake', 'seal', 'frog', 'cat', 'raccoon', 'hyrax'].map((id) => ({ id })); G.Callsigns = { LIST, valid: (a) => LIST.some((x) => x.id === a) }; }
  win.fire = (ev) => (listeners[ev] || []).forEach((f) => f());
  win.G = G;
  return win;
}
const until = async (f, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await sleep(20); } throw new Error('timed out waiting for ' + f.toString().slice(0, 120)); };
const careerRow = async (D, uid) => (await D.admin('select * from public.career where user_id = $1', [uid]))[0];

const D = await openDb();

// ---------------------------------------------------------------- the database on its own
await test('RLS: each user reads and writes only their own rows, the anon role nothing', async () => {
  const a = await D.user(), b = await D.user();
  await D.as(a, `insert into public.profiles (user_id, name) values ($1, 'A')`, [a]);
  await D.as(a, `insert into public.progress (user_id, arsenal) values ($1, '{"got":["tx22"]}')`, [a]);
  await D.as(a, `select public.career_add('{"add":{"kills":3}}'::jsonb)`);
  await D.as(a, `insert into public.runs (user_id, id, started_at) values ($1, gen_random_uuid(), now())`, [a]);
  for (const t of ['profiles', 'progress', 'career', 'runs']) {
    assert.equal((await D.as(b, `select * from public.${t}`)).length, 0, 'B sees none of ' + t);
    assert.equal((await D.as(a, `select * from public.${t}`)).length, 1, 'A sees their own ' + t);
    await assert.rejects(D.as(null, `select * from public.${t}`), /permission denied/, 'anon reads ' + t);
  }
  await assert.rejects(D.as(b, `insert into public.profiles (user_id, name) values ($1, 'X')`, [a]), /row-level security/);
  assert.equal((await D.as(b, `update public.profiles set name = 'X' where user_id = $1 returning *`, [a])).length, 0, 'B updates A');
  assert.equal((await D.as(b, `delete from public.career where user_id = $1 returning *`, [a])).length, 0, 'B deletes A');
  await D.as(b, `insert into public.profiles (user_id, name) values ($1, 'B')`, [b]);
  await assert.rejects(D.as(b, `update public.profiles set user_id = $1 where user_id = $2`, [a, b]), /row-level security/, 'B moves their row onto A');
  assert.equal((await careerRow(D, a)).kills, 3);
  await assert.rejects(D.as(null, `select public.career_add('{"add":{"kills":1}}'::jsonb)`), /permission denied|not signed in/);
});
await test('limits: oversized and out-of-range rows are refused, career_add caps each addition, the run log keeps 1000', async () => {
  const a = await D.user();
  await assert.rejects(D.as(a, `insert into public.profiles (user_id, name) values ($1, repeat('x', 40))`, [a]), /check constraint/);
  await assert.rejects(D.as(a, `insert into public.progress (user_id, wishlist) values ($1, (select jsonb_agg(i) from generate_series(1, 600) i))`, [a]), /check constraint/);
  await assert.rejects(D.as(a, `insert into public.runs (user_id, id, started_at, outcome) values ($1, gen_random_uuid(), now(), 'won')`, [a]), /check constraint/);
  await assert.rejects(D.as(a, `insert into public.runs (user_id, id, started_at, squad) values ($1, gen_random_uuid(), now(), 40)`, [a]), /check constraint/);
  const r = (await D.as(a, `select * from public.career_add('{"add":{"kills":999999999,"deaths":-5},"max":{"deepest":12}}'::jsonb)`))[0];
  assert.equal(r.kills, 100000); assert.equal(r.deaths, 0); assert.equal(r.deepest, 12);
  const r2 = (await D.as(a, `select * from public.career_add('{"max":{"deepest":3},"best_level":{"lvl":4},"best_credits":{"credits":900}}'::jsonb)`))[0];
  assert.equal(r2.deepest, 12); assert.equal(r2.best_level.lvl, 4);
  const r3 = (await D.as(a, `select * from public.career_add('{"best_level":{"lvl":2},"best_credits":{"credits":1500}}'::jsonb)`))[0];
  assert.equal(r3.best_level.lvl, 4, 'a worse best is ignored'); assert.equal(r3.best_credits.credits, 1500);
  await D.as(a, `insert into public.runs (user_id, id, started_at) select $1, gen_random_uuid(), now() - (i || ' minutes')::interval from generate_series(1, 1003) i`, [a]);
  assert.equal(+(await D.admin('select count(*) n from public.runs where user_id = $1', [a]))[0].n, 1000);
});

await test('guest cleanup: anonymous users idle 90 days go, with their rows; active, recent or emailed ones stay', async () => {
  const old = "now() - interval '100 days'";
  const idle = await D.user(), played = await D.user(), fresh = await D.user(), mailed = await D.user('kept@example.com');
  for (const u of [idle, played, mailed]) await D.admin(`update auth.users set created_at = ${old}, updated_at = ${old}, last_sign_in_at = ${old} where id = $1`, [u]);
  await D.admin(`update auth.users set is_anonymous = false where id = $1`, [mailed]);
  for (const u of [idle, played, fresh]) await D.as(u, `select public.career_add('{"add":{"kills":1}}'::jsonb)`);
  await D.admin('set session_replication_role = replica'); // (its rows idle too: past the trigger that stamps updated_at)
  await D.admin(`update public.career set updated_at = ${old} where user_id = $1`, [idle]);
  await D.admin('set session_replication_role = origin');
  await D.as(played, `insert into public.runs (user_id, id, started_at) values ($1, gen_random_uuid(), now())`, [played]); // (played lately: a run row)
  const n = (await D.admin('select public.bp_cleanup_guests(90) n'))[0].n;
  const left = new Set((await D.admin('select id from auth.users')).map((r) => r.id));
  assert.equal(left.has(idle), false); assert.ok(left.has(played) && left.has(fresh) && left.has(mailed));
  assert.equal((await D.admin('select count(*) n from public.career where user_id = $1', [idle]))[0].n, 0, 'its rows cascaded');
  assert.ok(n >= 1);
  await assert.rejects(D.as(fresh, 'select public.bp_cleanup_guests(90)'), /permission denied/, 'not callable by players');
  await assert.rejects(D.admin('select public.bp_cleanup_guests(5)'), /at least 30/);
});

// ---------------------------------------------------------------- the game's client against the stand-in
await test('merge rules (pure functions)', async () => {
  const w = browser(null, storage(), { cfg: null }), C = w.G.Cloud;
  const m = C.mergePrefs(['a', 'b', 'c', 'd'], { a: 1, b: 2, c: 3 }, { a: 10, b: 5, c: 0 }, { a: 9, b: 8, d: 4 }, { a: 5, b: 20 });
  assert.deepEqual({ ...m.vals }, { a: 1, b: 8, c: 3, d: 4 }); assert.deepEqual([...m.toLocal], ['b', 'd']); assert.equal(m.toCloud, true);
  const t = C.mergePrefs(['n'], { n: 'Operator12' }, { n: 0 }, { n: 'Hawk' }, { n: 0 });
  assert.equal(t.vals.n, 'Hawk', 'a tie (an untouched default) is the account\'s');
  const a = C.mergeArsenal({ got: ['tx22'], n: { p9: { kills: 20, tap: 3 } }, pro: {}, on: { p9: true } }, { got: ['derringer'], n: { p9: { kills: 12, tap: 9 }, tx22: { burst: 2 } }, pro: { p9: 1 }, on: { p9: false } }, false);
  assert.deepEqual([...a.got].sort(), ['derringer', 'tx22']); assert.deepEqual({ ...a.n.p9 }, { kills: 20, tap: 9 }); assert.equal(a.n.tx22.burst, 2); assert.equal(a.pro.p9, 1); assert.equal(a.on.p9, true);
});

await test('not set up: no client made, nothing queued, the Account box says so', async () => {
  const server = fakeServer(D), st = storage(), w = browser(server, st, { cfg: { url: '', key: '' } });
  w.G.Cloud.boot(); w.G.U.store.set('sens', 2); w.G.Career.runStart();
  await sleep(1700);
  assert.equal(w.G.Cloud.state, 'off'); assert.equal(server.calls.length, 0); assert.equal(st.getItem('bp_cloudq'), null);
  const off = browser(server, storage(), { search: '?cloud=0' }); off.G.Cloud.boot(); off.G.U.store.set('sens', 2); await sleep(1700);
  assert.equal(off.G.Cloud.state, 'off'); assert.equal(server.calls.length, 0);
});

const server = fakeServer(D);
const stA = storage();
let A, uidA;
await test('guest: local progress from before the cloud goes up to a new anonymous user on the first visit', async () => {
  // played offline first, no project: an unlock, tallies, a run with a kill
  const pre = browser(null, stA, { cfg: null });
  pre.G.Cloud.boot();
  pre.G.U.store.set('arsenal', { got: ['tx22'], n: { p9: { kills: 31 } }, pro: { p9: 1 }, on: {} });
  pre.G.U.store.set('name', 'Hawkeye'); pre.G.U.store.set('sens', 1.4);
  const C = pre.G.Career; C.runStart(); C.levelStart(1, 0, false, false); C.ev('kill', 60, true); C.ev('arrest', 120); C.levelEnd({ arrests: 1, incap: 1, civKilled: 0 }, 400); C.runEnd('left');
  // then the project's there
  A = browser(server, stA); A.G.Cloud.boot();
  await until(() => A.G.Cloud.state === 'ok' && A.G.Cloud.user);
  uidA = A.G.Cloud.user.id;
  assert.equal(A.G.Cloud.user.is_anonymous, true); assert.equal(A.G.Cloud.guest(), true);
  const prof = (await D.admin('select * from public.profiles where user_id = $1', [uidA]))[0], prog = (await D.admin('select * from public.progress where user_id = $1', [uidA]))[0];
  assert.equal(prof.name, 'Hawkeye'); assert.equal(prof.settings.sens, 1.4);
  assert.deepEqual(prog.arsenal.got, ['tx22']); assert.equal(prog.arsenal.n.p9.kills, 31);
  const c = await careerRow(D, uidA);
  assert.equal(c.kills, 1); assert.equal(c.arrests, 1); assert.equal(c.runs, 1); assert.equal(c.levels, 1); assert.equal(c.headshots, 1); assert.equal(c.deepest, 1); assert.equal(+c.credits, 580);
  const runs = await D.admin('select * from public.runs where user_id = $1', [uidA]);
  assert.equal(runs.length, 1); assert.equal(runs[0].outcome, 'left'); assert.equal(runs[0].levels[0].report.arrests, 1);
});
await test('reload: the session is restored, nothing counted twice; a change while playing goes up after the debounce', async () => {
  A = browser(server, stA); A.G.Cloud.boot();
  await until(() => A.G.Cloud.state === 'ok' && A.G.Cloud.user);
  assert.equal(A.G.Cloud.user.id, uidA);
  assert.equal((await careerRow(D, uidA)).kills, 1);
  A.G.Career.runStart(); A.G.Career.levelStart(1, 1, true, false); A.G.Career.ev('kill', 50);
  A.G.Cloud.flush(); await until(async () => (await careerRow(D, uidA)).kills === 2);
  assert.equal(A.G.Career.stats().kills, 2);
});
await test('offline: writes queue while the network is down, and go up once it is back', async () => {
  server.offline = true; A.navigator.onLine = false;
  A.G.Career.ev('kill', 50); A.G.Career.ev('rescue', 240); A.G.U.store.set('fov', 95);
  await A.G.Cloud.flush();
  await until(() => A.G.Cloud.state === 'offline').finally(() => {});
  const q = JSON.parse(stA.getItem('bp_cloudq'));
  assert.equal(q.add.kills, 1); assert.equal(q.add.rescued, 1); assert.equal(q.profile, 1);
  assert.equal((await careerRow(D, uidA)).kills, 2, 'nothing reached the server');
  // a reload while still offline keeps the queue
  A = browser(server, stA); A.navigator.onLine = false; A.G.Cloud.boot(); await sleep(1800);
  assert.equal(JSON.parse(stA.getItem('bp_cloudq')).add.kills, 1);
  server.offline = false; A.navigator.onLine = true; A.fire('online');
  await until(async () => (await careerRow(D, uidA)).kills === 3 && A.G.Cloud.state === 'ok', 15000);
  const c = await careerRow(D, uidA), prof = (await D.admin('select * from public.profiles where user_id = $1', [uidA]))[0];
  assert.equal(c.rescued, 1); assert.equal(prof.settings.fov, 95);
  await until(() => JSON.parse(stA.getItem('bp_cloudq')).profile === 0);
  const q2 = JSON.parse(stA.getItem('bp_cloudq')); assert.deepEqual(q2.add, {}); assert.equal(q2.profile, 0);
});
await test('the TURN relay\'s settings stay in the browser, and one an older version synced is dropped by the next write', async () => {
  A.G.U.store.set('turn', { url: 'turn:relay.example:3478', user: 'u', pass: 'secret' });
  A.G.U.store.set('sens', 1.6); A.G.Cloud.flush();
  await until(async () => (await D.admin('select settings from public.profiles where user_id = $1', [uidA]))[0].settings.sens === 1.6, 15000);
  let prof = (await D.admin('select * from public.profiles where user_id = $1', [uidA]))[0];
  assert.equal(prof.settings.turn, undefined); assert.equal(prof.mt.turn, undefined); assert.equal(prof.settings.sens, 1.6);
  // as an older client left it: the credentials in the row
  await D.admin(`update public.profiles set settings = settings || '{"turn":{"url":"turn:old","pass":"leaked"}}'::jsonb, mt = mt || '{"turn":99999999999999}'::jsonb where user_id = $1`, [uidA]);
  A.G.U.store.set('fov', 96); A.G.Cloud.flush();
  await until(async () => (await D.admin('select settings from public.profiles where user_id = $1', [uidA]))[0].settings.fov === 96, 15000);
  prof = (await D.admin('select * from public.profiles where user_id = $1', [uidA]))[0];
  assert.equal(prof.settings.turn, undefined, 'dropped'); assert.equal(prof.mt.turn, undefined);
  assert.equal(JSON.parse(stA.getItem('bp_turn')).pass, 'secret', 'the local one untouched, the row\'s never merged in');
});
await test('callsign preference: an older row\'s animal and second choice, or a top three, become the whole ranked list, written again whole', async () => {
  const ALL = ['snake', 'seal', 'frog', 'cat', 'raccoon', 'hyrax'];
  await D.admin(`update public.profiles set animal = 'cat', settings = (settings - 'animals') || '{"animal2":"frog"}'::jsonb, mt = (mt - 'animals') || '{"animal":1000}'::jsonb where user_id = $1`, [uidA]);
  await A.G.Cloud.sync();
  const want = ['cat', 'frog', 'snake', 'seal', 'raccoon', 'hyrax'];
  assert.deepEqual(JSON.parse(stA.getItem('bp_animals')), want);
  let prof = (await D.admin('select * from public.profiles where user_id = $1', [uidA]))[0];
  assert.deepEqual(prof.settings.animals, want); assert.equal(prof.settings.animal2, undefined); assert.equal(prof.animal, 'cat'); assert.equal(prof.mt.animal, undefined);
  // a top three (the version before): the rest appended in their usual order
  await D.admin(`update public.profiles set settings = settings || '{"animals":["hyrax","seal","cat"]}'::jsonb, mt = mt || '{"animals":99999999999990}'::jsonb where user_id = $1`, [uidA]);
  await A.G.Cloud.sync();
  const want3 = ['hyrax', 'seal', 'cat', 'snake', 'frog', 'raccoon'];
  assert.deepEqual(JSON.parse(stA.getItem('bp_animals')), want3);
  prof = (await D.admin('select * from public.profiles where user_id = $1', [uidA]))[0];
  assert.deepEqual(prof.settings.animals, want3); assert.equal(prof.animal, 'hyrax');
  await D.admin(`update public.profiles set mt = mt || '{"animals":1000}'::jsonb where user_id = $1`, [uidA]);
  // a new order here: up whole, the column the 1st
  const mine = ['seal', 'cat', 'frog', 'hyrax', 'snake', 'raccoon'];
  A.G.U.store.set('animals', mine); A.G.Cloud.flush();
  await until(async () => (await D.admin('select animal from public.profiles where user_id = $1', [uidA]))[0].animal === 'seal', 15000);
  prof = (await D.admin('select * from public.profiles where user_id = $1', [uidA]))[0];
  assert.deepEqual(prof.settings.animals, mine); assert.equal(ALL.every((a) => mine.includes(a)), true);
});
const stB = storage();
let B;
await test('two guests: RLS keeps them apart through the API too', async () => {
  server.offline = false; // (whatever the last test left)
  B = browser(server, stB); B.G.Cloud.boot(); B.G.U.store.set('vol', 0.3);
  await until(() => B.G.Cloud.state === 'ok' && B.G.Cloud.user);
  const cl = B.G.Cloud.client;
  assert.notEqual(B.G.Cloud.user.id, uidA);
  assert.equal((await cl.from('career').select('*').eq('user_id', uidA).maybeSingle()).data, null);
  assert.equal((await cl.from('profiles').select('*')).data.length, 1, 'B sees only their own profile');
  const up = await cl.from('profiles').upsert({ user_id: uidA, name: 'pwned' }, { onConflict: 'user_id' });
  assert.ok(up.error, 'writing A\'s row is refused');
  assert.equal((await D.admin('select name from public.profiles where user_id = $1', [uidA]))[0].name, 'Hawkeye');
  const rpc = await cl.rpc('career_add', { d: { add: { kills: 5 } } });
  assert.equal(rpc.data.user_id, B.G.Cloud.user.id, 'career_add adds to your own row only');
  assert.equal((await careerRow(D, uidA)).kills, 3);
});
await test('save to email: the guest becomes an email account, the same user and rows', async () => {
  await A.G.Cloud.saveEmail('hawk@example.com');
  const mail = server.mail.find((m) => m.to === 'hawk@example.com' && m.type === 'email_change');
  assert.ok(mail, 'a confirmation was sent'); assert.equal(mail.redirect, 'http://localhost:8080/');
  await A.G.Cloud.verifyCode(mail.token);
  await until(() => !A.G.Cloud.guest());
  assert.equal(A.G.Cloud.user.id, uidA); assert.equal(A.G.Cloud.user.email, 'hawk@example.com');
  assert.equal(A.G.Cloud.meta().ownerAnon, false);
});
await test('sign in on another browser: its guest progress merges into the account (unions, maxima, newer settings, career added)', async () => {
  // B, a guest with progress of its own: another unlock, a higher tally, a lower one, a newer setting, a career
  B.G.U.store.set('arsenal', { got: ['derringer'], n: { p9: { kills: 12, close: 7 } }, pro: {}, on: {} });
  B.G.U.store.set('fov', 70); // (newer than A's 95)
  const C = B.G.Career; C.runStart(); C.levelStart(1, 0, false, false); C.ev('kill', 50); C.ev('kill', 50); C.ev('down'); C.levelEnd({ arrests: 0 }, 300); C.runEnd('left');
  await B.G.Cloud.flush();
  const uidB = B.G.Cloud.user.id, bKills = (await careerRow(D, uidB)).kills;
  assert.equal(bKills, 7); // (5 through the rpc above, 2 here)
  await B.G.Cloud.signInEmail('hawk@example.com');
  const mail = [...server.mail].reverse().find((m) => m.to === 'hawk@example.com' && m.type === 'email');
  await B.G.Cloud.verifyCode(mail.token);
  await until(() => B.G.Cloud.user && B.G.Cloud.user.id === uidA && B.G.Cloud.state === 'ok', 10000);
  const prog = (await D.admin('select * from public.progress where user_id = $1', [uidA]))[0], prof = (await D.admin('select * from public.profiles where user_id = $1', [uidA]))[0];
  assert.deepEqual([...prog.arsenal.got].sort(), ['derringer', 'tx22']);
  assert.equal(prog.arsenal.n.p9.kills, 31); assert.equal(prog.arsenal.n.p9.close, 7); assert.equal(prog.arsenal.pro.p9, 1);
  assert.equal(prof.settings.fov, 70, 'the newer setting'); assert.equal(prof.name, 'Hawkeye', 'B never chose a name: the account\'s');
  assert.equal(prof.settings.vol, 0.3, 'a setting only B had');
  const c = await careerRow(D, uidA);
  assert.equal(c.kills, 3 + bKills); assert.equal(c.downs, 1); assert.equal(c.runs, 2 + 1);
  assert.equal((await D.admin('select count(*) n from public.runs where user_id = $1', [uidA]))[0].n, 3, 'A\'s two runs and B\'s one, copied in; and B\'s guest rows stay its own');
  // and here, the merged copy
  assert.deepEqual([...JSON.parse(stB.getItem('bp_arsenal')).got].sort(), ['derringer', 'tx22']);
  assert.equal(B.G.Career.stats().kills, c.kills);
  assert.equal(JSON.parse(stB.getItem('bp_name')), 'Hawkeye');
});
await test('the other browser picks up the merged progress on its next sync', async () => {
  A = browser(server, stA); A.G.Cloud.boot();
  await until(() => A.G.Cloud.state === 'ok' && A.G.Cloud.user);
  assert.deepEqual([...JSON.parse(stA.getItem('bp_arsenal')).got].sort(), ['derringer', 'tx22']);
  assert.equal(JSON.parse(stA.getItem('bp_fov')), 70);
  assert.equal(A.G.Career.stats().kills, (await careerRow(D, uidA)).kills);
});
await test('sign out: the account\'s progress leaves this browser, preferences stay; signing back in brings it back', async () => {
  await B.G.Cloud.signOut();
  assert.equal(B.G.Cloud.user, null); assert.equal(stB.getItem('bp_arsenal'), null); assert.equal(B.G.Career.stats().kills, 0);
  assert.equal(JSON.parse(stB.getItem('bp_fov')), 70); assert.equal(B.G.Cloud.meta().owner, null);
  await B.G.Cloud.signInEmail('hawk@example.com');
  const mail = [...server.mail].reverse().find((m) => m.to === 'hawk@example.com' && m.type === 'email' && !m.used);
  await B.G.Cloud.verifyCode(mail.token);
  await until(() => B.G.Cloud.user && B.G.Cloud.state === 'ok', 10000);
  assert.equal(B.G.Career.stats().kills, (await careerRow(D, uidA)).kills, 'nothing added twice');
  assert.deepEqual([...JSON.parse(stB.getItem('bp_arsenal')).got].sort(), ['derringer', 'tx22']);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
