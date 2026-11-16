// The gun sounds' prewarming (js/gunkeys.ts, js/gunsoundcache.ts, docs/audio.md "Gun sounds: prewarming and the cache"), what a node tool can check of it:
//   - SYNTH_REV, the hash of js/gunshot-synth.ts the persistent cache was made for, matches the file: a change to the synth that doesn't bump it fails here
//     (node tools/gunsounds.test.mjs --rev prints the new one to put in js/gunsoundcache.ts)
//   - the key collector: every gun's loaded keys are among its all keys, every key has synth parameters, a gun's keys are its own, the loads with a report of
//     their own (subsonic, slug, birdshot, flechette, +P) have theirs, a gun of several barrels has one per effective length, the suspects' guns are by plain id
//   - the cache without IndexedDB (here): off, and nothing throws
//   - the simulation's files don't name any of it (also npm run deps:check)
// node tools/gunsounds.test.mjs
import { moduleOf, runFile } from './vm_game.mjs'; // (first: it starts node again with what the ES modules need)
import { loadLevel, ROOT } from './level_env.mjs';
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';

const DIST = path.join(ROOT, 'dist/js/'), sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 12); // (the text with LF line ends: a checkout with CRLF (Windows) and CI's agree)
const want = sha('js/gunshot-synth.ts');
if (process.argv.includes('--rev')) { console.log(want); process.exit(0); }
let fail = 0; const bad = (m) => { fail++; console.error('FAIL ' + m); };
const ok = (c, m) => { if (!c) bad(m); };

const have = /SYNTH_REV = '([0-9a-f]+)'/.exec(fs.readFileSync(path.join(ROOT, 'js/gunsoundcache.ts'), 'utf8'))?.[1];
ok(have === want, `SYNTH_REV is ${have}, js/gunshot-synth.ts hashes to ${want}: the stored gun sounds would be stale (node tools/gunsounds.test.mjs --rev, into js/gunsoundcache.ts)`);

const env = await loadLevel(), G = env.G;
await runFile(env.ctx, DIST + 'gunkeys.js'); await runFile(env.ctx, DIST + 'gunsoundcache.js');
const { GunKeys } = moduleOf(env.ctx, DIST + 'gunkeys.js'), { GunSoundCache } = moduleOf(env.ctx, DIST + 'gunsoundcache.js');
const { WEAPONS, Gunsmith, ammoTypes, calOf, barrelMm, ENEMIES } = G;

let guns = 0, total = 0, variants = 0, multi = 0, most = ['', 0];
for (const id of Object.keys(WEAPONS)) {
  const def = Gunsmith.compile(id, Gunsmith.defaultBuild(id));
  if (!def) continue;
  const k = GunKeys.ofDef(def);
  if (!G.GUN_SPECS[id]) { ok(!k.all.length, `${id}: has no synth parameters but has sound keys ${k.all}`); continue; }
  guns++; total += k.all.length; variants += k.all.length - 1;
  ok(k.loaded.length >= 1, `${id}: no loaded key`);
  ok(k.loaded.every((x) => k.all.includes(x)), `${id}: a loaded key is not in all`);
  ok(new Set(k.all).size === k.all.length, `${id}: duplicate keys`);
  ok(k.all.every((x) => Gunsmith.soundSpec(x)), `${id}: a key without synth parameters`);
  ok(k.all.every((x) => x.split('@')[0].split(':')[0].split('.')[0] === id || def.barrels), `${id}: a key that isn't its own: ${k.all}`);
  if (def.barrels) { multi++; const n = Object.keys(def.barrels.rounds).reduce((a, r) => a + barrelMm(def, r).length, 0); ok(k.all.length >= n, `${id}: ${k.all.length} keys for ${n} effective lengths`); }
  if (k.all.length > most[1]) most = [id, k.all.length];
}
console.log(`${guns} guns with a report, ${total} keys by their factory builds (${variants} beyond each gun's first), ${multi} of several barrels; the most: ${most[0]} with ${most[1]}`);
// the loads with their own report
const p9 = GunKeys.ofDef(Gunsmith.compile('p9', Gunsmith.defaultBuild('p9')));
ok(p9.all.some((x) => x.includes('@')), 'p9: no load with a report of its own (+P)');
const shot = GunKeys.ofDef(Gunsmith.compile('pump', Gunsmith.defaultBuild('pump')));
for (const t of ['slug', 'birdshot']) ok(shot.all.some((x) => x.endsWith('@' + t) || x.includes('@' + t)), `pump: no ${t} key (${shot.all})`);
// a gun loaded with a load of its own has that one as its loaded key
const slug = GunKeys.of({ def: Gunsmith.compile('pump', Gunsmith.defaultBuild('pump')), ammo: 'slug' });
ok(slug.loaded.length === 1 && slug.loaded[0].endsWith('@slug'), `pump with slugs: loaded ${slug.loaded}`);
// the suspects' guns
const pool = ['ak', 'ak'], en = GunKeys.enemy(pool);
ok(new Set(en).size === en.length && en.includes('ak'), 'enemy: duplicates or missing');
for (const e of Object.values(ENEMIES)) if (e.wpn && !e.civ && WEAPONS[e.wpn] && G.GUN_SPECS[e.wpn]) ok(en.includes(e.wpn), `enemy: ${e.wpn} (a kind's own gun) not in the keys`);
// the cache with no IndexedDB
ok(!GunSoundCache.available(), 'the cache says it is available with no IndexedDB');
ok((await GunSoundCache.getMany(new Map([['x', 'y']]))).size === 0, 'a read with no IndexedDB found something');
GunSoundCache.version = 'v'; GunSoundCache.put('x', 'y', { numberOfChannels: 1, sampleRate: 1, getChannelData: () => new Float32Array(1) });
ok(GunSoundCache.hash('a') !== GunSoundCache.hash('b') && GunSoundCache.hash('a') === GunSoundCache.hash('a'), 'the hash');
// the simulation names none of it
for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter((n) => n.endsWith('.ts'))) {
  if (['gunsounds.ts', 'gunkeys.ts', 'gunsoundcache.ts', 'gunaudio.ts'].includes(f)) continue;
  const s = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  if (['serverhost.ts', 'serverworker.ts', 'server.ts', 'sim.ts', 'parts.ts', 'data.ts'].includes(f) && /gunsound|gunkeys/.test(s)) bad(`${f} names the gun sounds' files`);
}
console.log(fail ? `${fail} FAILED` : 'ok');
process.exit(fail ? 1 : 0);
