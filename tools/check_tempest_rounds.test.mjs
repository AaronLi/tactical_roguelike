// The Tempest's round types (TASK 20; js/data.ts def.barrels.rounds, CALIBERS loads, js/gear.ts): the length of round loaded in a block decides its capacity, the boxes
// that fill it, the per-barrel bookkeeping and the rounds' figures. Data-level checks on the compiled game (no browser).   node tools/check_tempest_rounds.test.mjs
import { loadGame } from './model_env.mjs';
const G = loadGame(); let bad = 0, n = 0;
const ok = (label, cond, extra = '') => { n++; if (!cond) { bad++; console.error(`FAIL ${label} ${extra}`); } else console.log('ok   ' + label); };
const eq = (label, a, b) => ok(label, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
const def = G.Gunsmith.compile('tempest'), Gr = G.Gear, b = def.barrels;

// the table: each round type's count, caliber and sound spec
eq('round types', Object.keys(b.rounds), ['standard', 'rifle']);
eq('default type', b.default, 'standard');
eq('standard: 10 a barrel, 60 in the block', [G.roundOf(def, 'standard').per, G.capOf(def)], [10, 60]);
eq('rifle: 5 a barrel, 30 in the block', [G.roundOf(def, 'rifle').per, b.n * G.roundOf(def, 'rifle').per], [5, 30]);
eq('a weapon with no rl has the default', G.capOf({ def }), 60);
eq('a weapon with the rifle round holds 30', G.capOf({ def, rl: 'rifle' }), 30);
eq('an unknown rl falls back to the default', G.roundOf(def, 'nonsense').rl, 'standard');
eq('the weapon table mag is the default block', def.mag, 60);
eq('calibers', [G.cartOf({ def }), G.cartOf({ def, rl: 'rifle' })], ['10/31', '10/53']);
eq('a block item says its caliber', G.cartOf({ wid: 'tempest', rl: 'rifle' }), '10/53');
eq('another gun is unchanged', [G.cartOf({ def: G.WEAPONS.m4 }), G.capOf({ def: G.WEAPONS.m4 }), G.calsOf(G.WEAPONS.m4).length], [G.calOf(G.WEAPONS.m4), G.WEAPONS.m4.mag, 1]);
eq('both calibers are loadable', G.calsOf(def), ['10/31', '10/53']);
for (const [k, r] of Object.entries(b.rounds)) {
  const C = G.CALIBERS[r.cal], S = G.GUN_SPECS[r.spec];
  ok(`${k}: caliber ${r.cal} exists, with a box, loads and a sound spec`, C && S && C.loads && G.MUZZLE_V[r.cal] && G.CHARGE_GR[r.cal] && S.caliber + '/' + S.caseLength === r.cal);
  ok(`${k}: every load has figures`, G.ammoTypes(r.cal).every((am) => G.AMMO[am] && C.loads[am]), JSON.stringify(G.ammoTypes(r.cal)));
}
eq('standard loads', G.ammoTypes('10/31'), ['ball', 'hp', 'tracer']);
eq('rifle loads', G.ammoTypes('10/53'), ['ball', 'hp', 'tracer', 'sabot', 'buck']);
eq('factory load is ball', [G.ballFor('10/31'), G.ballFor('10/53')], ['ball', 'ball']);
ok('a sabot is not a standard load', G.ammoOk('10/31', 'sabot') === 'ball' && G.ammoOk('10/53', 'sabot') === 'sabot');
// speeds at the longest effective length (the last shot of a barrel): the user's figures
const last = (rl, am) => Math.round(G.roundSpeed(G.shotDef(def, { def, rl, mag: b.n, bl: Array(b.n).fill(1) }, 0).def, am));
eq('standard ball, last shot: 650 m/s', last('standard', 'ball'), 650);
eq('rifle ball, last shot: 850 m/s', last('rifle', 'ball'), 850);
eq('rifle sabot, last shot: 945 m/s', last('rifle', 'sabot'), 945);
eq('rifle buck, last shot: 430 m/s', last('rifle', 'buck'), 430);
// buckshot: five pellets a round
eq('buckshot is 5 pellets a barrel, 30 for six barrels', [G.roundDef(G.shotDef(def, { def, rl: 'rifle', mag: 30 }, 0).def, 'buck').pellets, 6 * G.roundDef(G.shotDef(def, { def, rl: 'rifle', mag: 30 }, 0).def, 'buck').pellets], [5, 30]);
eq('ball is one bullet', G.roundDef(G.shotDef(def, { def, rl: 'rifle', mag: 30 }, 0).def, 'ball').pellets || 1, 1);

// the per-barrel bookkeeping follows the type
const wS = { def, rl: 'standard', mag: 60 }, wR = { def, rl: 'rifle', mag: 30 };
eq('a full 60 block: ten in every barrel', G.barrelsOf(wS), [10, 10, 10, 10, 10, 10]);
eq('a full 30 block: five in every barrel', G.barrelsOf(wR), [5, 5, 5, 5, 5, 5]);
eq('a part-full rifle block spreads evenly (the lowest the emptier)', G.barrelsOf({ def, rl: 'rifle', mag: 22 }), [3, 3, 4, 4, 4, 4]);
eq('a block of 40 standard', G.barrelsOf({ def, rl: 'standard', mag: 40 }), [6, 6, 7, 7, 7, 7]);
// effective lengths: a shorter barrel set for a longer round; the scale is one for both
const mmS = G.barrelMm(def, 'standard'), mmR = G.barrelMm(def, 'rifle');
eq('the last shot is the same 508 mm for both', [mmS[mmS.length - 1], mmR[mmR.length - 1]], [508, 508]);
eq('counts', [mmS.length, mmR.length], [10, 5]);
ok('one k scale for both: the same bore gives the same share', Math.abs(G.shotK(def, 508) - 1) < 1e-9 && Math.abs(G.shotK(def, 229) - 0.8) < 1e-9 && G.shotK(def, mmR[0]) > G.shotK(def, mmS[0]));

// the items: a block of the rifle round, its capacity, its box, loading and swapping
const Me = { weapons: {}, kit: { carrier: null, belt: null, pack: null, ifak: null }, pockets: [], locker: { items: [] } };
Me.pockets = [];
const full60 = Gr.ammoItem(def, null, 'ball'), full30 = Gr.ammoItem(def, null, 'ball', undefined, 'rifle');
eq('a new block is the standard 60', [full60.cap, full60.n, full60.rl, full60.bl], [60, 60, 'standard', [10, 10, 10, 10, 10, 10]]);
eq('a rifle block is 30', [full30.cap, full30.n, full30.rl, full30.bl], [30, 30, 'rifle', [5, 5, 5, 5, 5, 5]]);
ok('block names say the round', /60-round barrel block \(10×31/.test(Gr.magName(full60)) && /30-round barrel block \(10×53/.test(Gr.magName(full30)), Gr.magName(full30));
const e30 = Gr.ammoItem(def, 0, 'ball', undefined, 'rifle'), box31 = Gr.boxItem('10/31', 'ball', 20), box53 = Gr.boxItem('10/53', 'sabot', 20);
eq('a 10x31 box does not fit a rifle block', Gr.loadMag(Me, e30, box31), 0);
eq('a 10x53 box fills it', [Gr.loadMag(Me, e30, box53), e30.n, e30.am], [20, 20, 'sabot']);
eq('and no more than 30', [Gr.loadMag(Me, e30, Gr.boxItem('10/53', 'ball', 50)), e30.n], [10, 30]);
// a gun's block swap: the length goes with the block
const w = { def, rl: 'standard', mag: 60, tube: Array(60).fill('ball'), ammo: 'ball', bl: [10, 10, 10, 10, 10, 10] };
Gr.exchange({ refit: null }, w, full30);
eq('the 30 block is in the gun', [w.rl, w.mag, G.capOf(w), w.bl], ['rifle', 30, 30, [5, 5, 5, 5, 5, 5]]);
eq('the 60 block came out as one', [full30.rl, full30.n, full30.cap, full30.bl], ['standard', 60, 60, [10, 10, 10, 10, 10, 10]]);
// packed and unpacked (dropped on the floor, picked up)
const un = Gr.unpack(JSON.parse(JSON.stringify(Gr.pack(full30))));
eq('a dropped block keeps its length and counts', [un.rl, un.cap, un.n, un.bl], ['standard', 60, 60, [10, 10, 10, 10, 10, 10]]);
const spares = Gr.spares(def, 30, 'ball', 'rifle');
eq('case spares of the rifle round are 30 blocks', spares.map((s) => [s.cap, s.n, s.rl]), [[30, 30, 'rifle']]);

console.log(bad ? `${bad} of ${n} checks FAILED` : `${n} Tempest round-type checks ok`);
process.exit(bad ? 1 : 0);
