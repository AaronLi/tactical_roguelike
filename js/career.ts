'use strict';
// Your career: what you've done over every run, and a log of the runs themselves, kept in this browser (G.U.store 'career' and
// 'runs') and, with the cloud saves on, in your account (js/cloud.ts, docs/cloud.md). Only your own: each player keeps theirs,
// host or not. It hears what your screen hears (js/game.ts: the host's word of kills, arrests, the phases; js/player.ts: you
// going down, dying), never the simulation itself, which is in its own thread (docs/threads.md). Nothing here changes play.
// A run: from the lobby's Deploy (the host's 'newrun'), or from joining one that's going, to the game over table (wiped), or
// to leaving it (left). One the page was closed in the middle of is put down as abandoned the next time the page loads.
interface CareerBest { id: string; start: number; lvl: number; credits: number; squad: number; outcome: string }
interface CareerStats {
  v: number; runs: number; runsDone: number; deepest: number; acts: number; levels: number; kills: number; incaps: number; headshots: number;
  arrests: number; rescued: number; civKilled: number; unauth: number; deaths: number; downs: number; revives: number; evidence: number; credits: number;
  bestLevel: CareerBest | null; bestCredits: CareerBest | null;
}
// a level of a run: where, and what you did in it (report: the squad's, as the hangar's screen shows it: js/shop.ts render)
interface CareerLevel {
  n: number; th: number; theme: string; night: boolean; stronghold: boolean; boss: boolean; cleared: boolean;
  kills: number; incaps: number; headshots: number; arrests: number; rescued: number; civKilled: number; unauth: number; evidence: number;
  downs: number; deaths: number; revives: number; credits: number; report: Record<string, number | boolean> | null;
}
interface CareerRun {
  id: string; v: number; start: number; end: number | null; solo: boolean; host: boolean; squad: number; joined: number | null;
  outcome: 'playing' | 'wiped' | 'left' | 'abandoned'; deepest: number; credits: number; kills: number; arrests: number; levels: CareerLevel[];
  t: number; u: number; sy: number; // (last touched; its version, and the version the cloud has: js/cloud.ts)
}
const G_Career = (() => {
  const V = 1, KEEP = 50;
  // the counters, and their columns in the career table (supabase/migrations)
  const COLS: Record<string, string> = { runs: 'runs', runsDone: 'runs_done', acts: 'acts', levels: 'levels', kills: 'kills', incaps: 'incaps', headshots: 'headshots', arrests: 'arrests', rescued: 'rescued', civKilled: 'civ_killed', unauth: 'unauth', deaths: 'deaths', downs: 'downs', revives: 'revives', evidence: 'evidence', credits: 'credits' };
  const zero = (): CareerStats => ({ v: V, runs: 0, runsDone: 0, deepest: 0, acts: 0, levels: 0, kills: 0, incaps: 0, headshots: 0, arrests: 0, rescued: 0, civKilled: 0, unauth: 0, deaths: 0, downs: 0, revives: 0, evidence: 0, credits: 0, bestLevel: null, bestCredits: null });
  const num = (x: unknown) => (typeof x === 'number' && isFinite(x) ? x : 0);
  // what's stored, made whole whatever shape it's in (an older version, a hand-edited one)
  function clean(s: any): CareerStats {
    const z = zero();
    if (!s || typeof s !== 'object') return z;
    for (const k of Object.keys(COLS)) (z as any)[k] = Math.max(0, Math.round(num(s[k])));
    z.deepest = Math.max(0, Math.round(num(s.deepest)));
    z.bestLevel = s.bestLevel && typeof s.bestLevel === 'object' ? s.bestLevel : null;
    z.bestCredits = s.bestCredits && typeof s.bestCredits === 'object' ? s.bestCredits : null;
    return z;
  }
  let stats: CareerStats | null = null, list: CareerRun[] | null = null, run: CareerRun | null = null, lvl: CareerLevel | null = null;
  const S = () => stats || (stats = clean(G.U.store.get('career', null)));
  const L = (): CareerRun[] => list || (list = (G.U.store.get('runs', []) || []).filter((r: any) => r && typeof r.id === 'string' && Array.isArray(r.levels)));
  const keepStats = () => G.U.store.put('career', S());
  function keepRuns() {
    const l = L();
    l.sort((a, b) => b.start - a.start);
    // the newest KEEP (the cloud keeps the rest); the ones the cloud hasn't got yet go last
    while (l.length > KEEP) { let i = l.length - 1; for (let j = l.length - 1; j >= 0; j--) if (l[j].sy === l[j].u && l[j] !== run) { i = j; break; } l.splice(i, 1); }
    G.U.store.put('runs', l);
  }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
  // one more of something: here, and to the account (js/cloud.ts add: queued till it's sent)
  function bump(k: string, n = 1) {
    if (!n) return;
    (S() as any)[k] += n; keepStats();
    if (G.Cloud) G.Cloud.add({ [k]: n });
  }
  function deepest(n: number) {
    if (n > S().deepest) { S().deepest = n; keepStats(); if (G.Cloud) G.Cloud.add({}, { deepest: n }); }
  }
  function touch(push = false) {
    if (!run) return;
    run.t = Date.now();
    if (push) run.u++;
    if (!L().includes(run)) L().unshift(run);
    keepRuns();
    if (push && G.Cloud) G.Cloud.runChanged();
  }
  const summary = (r: CareerRun): CareerBest => ({ id: r.id, start: r.start, lvl: r.deepest, credits: r.credits, squad: r.squad, outcome: r.outcome });

  // ------------------------------------------------------------- runs
  function runStart(joined: number | null = null) {
    if (run) runEnd('left');
    const net = G.Net;
    run = { id: uuid(), v: V, start: Date.now(), end: null, solo: !!net.solo, host: !!net.isHost, squad: Math.max(1, Object.keys((G.Game && G.Game.roster) || {}).length), joined,
      outcome: 'playing', deepest: 0, credits: 0, kills: 0, arrests: 0, levels: [], t: Date.now(), u: 1, sy: 0 };
    lvl = null;
    bump('runs');
    touch(true);
  }
  function runEnd(outcome: 'wiped' | 'left') {
    if (!run) return;
    if (lvl) { run.levels.push(lvl); lvl = null; }
    run.end = Date.now(); run.outcome = outcome;
    if (outcome === 'wiped') bump('runsDone');
    const s = S(), b = summary(run);
    type Best = { best_level?: CareerBest; best_credits?: CareerBest };
    let best: Best | null = null;
    if (run.deepest > 0 && (!s.bestLevel || run.deepest > s.bestLevel.lvl)) { s.bestLevel = b; (best = best || ({} as Best)).best_level = b; }
    if (run.credits > 0 && (!s.bestCredits || run.credits > s.bestCredits.credits)) { s.bestCredits = b; (best = best || ({} as Best)).best_credits = b; }
    keepStats();
    if (best && G.Cloud) G.Cloud.add({}, {}, best);
    touch(true);
    run = null;
  }
  // the squad's size: the most it's been this run
  function squad(n: number) { if (run && n > run.squad) { run.squad = n; touch(); } }
  function levelStart(n: number, th: number | undefined, night: boolean, stronghold: boolean) {
    if (!run) runStart(n); // (joined a run already going)
    if (lvl) run!.levels.push(lvl); // (a level never seen to its end: the next one's begun)
    const T = th != null && G.THEMES[th] ? G.THEMES[th] : null;
    lvl = { n, th: th == null ? -1 : th, theme: T ? T.name : '', night: !!night, stronghold: !!stronghold, boss: !!(G.Route && G.Route.isBoss(n)), cleared: false,
      kills: 0, incaps: 0, headshots: 0, arrests: 0, rescued: 0, civKilled: 0, unauth: 0, evidence: 0, downs: 0, deaths: 0, revives: 0, credits: 0, report: null };
    run!.deepest = Math.max(run!.deepest, n);
    deepest(n);
    touch(true);
  }
  const REPORT = ['arrests', 'incap', 'bleedouts', 'rescued', 'evidence', 'bodies', 'civKilled', 'unauth', 'allRescued', 'stronghold'];
  // extracted to the hangar: the level's report as the host sent it, and the mission bonus you were paid for it
  function levelEnd(report: Record<string, any> | null, bonus: number) {
    if (!run || !lvl || lvl.cleared) return;
    lvl.cleared = true;
    if (report) { const r: Record<string, number | boolean> = {}; for (const k of REPORT) if (typeof report[k] === 'number' || typeof report[k] === 'boolean') r[k] = report[k]; lvl.report = r; }
    run.levels.push(lvl);
    if (bonus) { lvl.credits += bonus; run.credits += bonus; bump('credits', bonus); }
    bump('levels');
    if (lvl.boss) bump('acts');
    lvl = null;
    touch(true);
  }
  // something you did (the host's word of it: js/game.ts), and what it paid (or cost)
  function ev(kind: 'kill' | 'incap' | 'civ' | 'unauth' | 'arrest' | 'rescue' | 'body' | 'evidence' | 'down' | 'death' | 'revive', cr = 0, hs = false) {
    const K: Record<string, string> = { kill: 'kills', incap: 'incaps', civ: 'civKilled', unauth: 'unauth', arrest: 'arrests', rescue: 'rescued', evidence: 'evidence', down: 'downs', death: 'deaths', revive: 'revives' };
    const k = K[kind];
    if (k) bump(k);
    if (hs && (kind === 'kill' || kind === 'incap')) bump('headshots');
    if (cr > 0) bump('credits', Math.round(cr));
    if (!run) return;
    if (lvl) { if (k) (lvl as any)[k]++; if (hs) lvl.headshots++; lvl.credits += Math.round(cr); }
    if (kind === 'kill' || kind === 'incap') run.kills++;
    if (kind === 'arrest') run.arrests++;
    run.credits += Math.round(cr);
    touch();
  }

  // ------------------------------------------------------------- the cloud's side (js/cloud.ts)
  function init() {
    // a run the page closed on: abandoned, as of when it was last touched
    let n = 0;
    for (const r of L()) if (r.outcome === 'playing' && r !== run) { r.outcome = 'abandoned'; r.end = r.end || r.t || r.start; r.u = (r.u || 0) + 1; n++; }
    if (n) keepRuns();
  }
  // the account's runs, merged into what's here by id: one not here is added; one that is, and that the cloud has had since,
  // takes the account's copy if that's newer (another device's run, still going when it was last seen here). Local changes
  // the cloud hasn't had yet stay.
  function mergeRuns(recs: CareerRun[]) {
    const l = L();
    for (const c of recs) {
      const i = l.findIndex((r) => r.id === c.id);
      if (i < 0) { c.u = c.sy = 1; l.push(c); } else if (l[i] !== run && l[i].sy === l[i].u && c.t > l[i].t) { c.u = c.sy = l[i].u; l[i] = c; }
    }
    keepRuns();
  }
  // every run here, to be sent (again) to the account: local progress joining a new account
  function unsyncAll() { for (const r of L()) r.sy = 0; keepRuns(); }
  // only the account's runs: an account that isn't the one this browser's copy was of
  function onlyRuns(recs: CareerRun[]) { list = run ? [run] : []; mergeRuns(recs); }
  function setStats(s: any) { stats = clean(s); keepStats(); }
  function markSynced(id: string, u: number) { const r = L().find((q) => q.id === id); if (r && r.u === u) { r.sy = u; keepRuns(); } }
  // signed out: this browser's copy goes (the account keeps it)
  function reset() { stats = zero(); list = []; lvl = null; run = null; keepStats(); keepRuns(); }

  // ------------------------------------------------------------- the career screen (main menu) and the hangar's Career tab
  function html(): string {
    const s = S(), f = G.U.fmt, esc = G.U.esc;
    const tile = (label: string, v: string | number, sub = '') => `<div class="cr-tile"><b>${v}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const OUT: Record<string, string> = { playing: 'In progress', wiped: 'Squad wiped', left: 'Left', abandoned: 'Abandoned' };
    const best = (b: CareerBest | null, what: string) => b ? `<div class="cr-best"><span>${what}</span><b>${what === 'Most credits' ? '¢' + f(b.credits) : 'Level ' + b.lvl}</b><small>${day(b.start)} · ${b.squad > 1 ? 'squad of ' + b.squad : 'solo'}${what === 'Most credits' ? ' · level ' + b.lvl : ' · ¢' + f(b.credits)}</small></div>` : '';
    const runs = L().slice(0, 10).map((r) => {
      const lv = r.levels.map((q) => `<li><b>${q.n}</b> ${esc(q.theme || '?')}${q.night ? ' ☾' : ''}${q.stronghold ? ' <b class="red">!</b>' : ''}${q.boss ? ' <b class="red">boss</b>' : ''} <span class="dim">${q.cleared ? 'cleared' : 'not cleared'} · ${q.kills + q.incaps} down · ${q.arrests} arrested${q.rescued ? ' · ' + q.rescued + ' rescued' : ''}${q.deaths ? ' · KIA' : ''}</span></li>`).join('');
      return `<details class="cr-run"><summary><span>${day(r.start)}</span><span>${r.squad > 1 ? 'Squad of ' + r.squad : 'Solo'}</span><span>Level ${r.deepest || '—'}</span><span>${r.kills} / ${r.arrests}</span><span class="${r.outcome === 'wiped' ? 'red' : 'dim'}">${OUT[r.outcome] || r.outcome}</span></summary>${lv ? `<ul>${lv}</ul>` : '<div class="dim">No levels played.</div>'}</details>`;
    }).join('');
    return `<div class="cr-grid">${tile('Runs', f(s.runs), f(s.runsDone) + ' to the end')}${tile('Deepest level', s.deepest || '—', f(s.acts) + ' act' + (s.acts === 1 ? '' : 's') + ' cleared')}${tile('Levels cleared', f(s.levels))}${tile('Kills', f(s.kills), f(s.headshots) + ' headshots')}
      ${tile('Incapacitated', f(s.incaps))}${tile('Arrests', f(s.arrests))}${tile('Civilians rescued', f(s.rescued), s.civKilled ? `<span class="red">${f(s.civKilled)} killed</span>` : 'none killed')}${tile('Evidence bagged', f(s.evidence))}
      ${tile('Downs', f(s.downs), f(s.deaths) + ' KIA')}${tile('Revives given', f(s.revives))}${tile('Credits earned', '¢' + f(s.credits))}${tile('Unauthorised', f(s.unauth))}</div>
      ${s.bestLevel || s.bestCredits ? `<h3 class="cr-h">Best runs</h3><div class="cr-bests">${best(s.bestLevel, 'Deepest')}${best(s.bestCredits, 'Most credits')}</div>` : ''}
      <h3 class="cr-h">Last runs <small class="dim">kills / arrests</small></h3>${runs || '<div class="dim">No runs yet.</div>'}`;
  }

  return { COLS, init, runStart, runEnd, squad, levelStart, levelEnd, ev, mergeRuns, unsyncAll, onlyRuns, setStats, markSynced, reset, html, clean,
    stats: () => S(), runs: () => L(), get run() { return run; }, get level() { return lvl; } };
})();
G.Career = G_Career;

interface GameModules { Career: typeof G_Career; }
