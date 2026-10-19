'use strict';
// Injuries, for the officers (suspects keep the simpler wound model in js/data.js).
//
// The body is seven parts, each with its own health: head 35, thorax 85, stomach 70, arms 60, legs 65. A hit
// takes health from the part it lands on, and can leave an injury there:
//   bleeding (light or heavy), a fracture (arms and legs), a punctured lung (thorax), a gut wound (stomach).
// An unarmoured head is still a kill. The head at zero is death; the thorax at zero puts you down (a teammate
// can revive you). A destroyed arm, leg or stomach passes further damage on to the thorax.
// Light bleeding clots by itself in 30-60 s (a bandage stops it at once; a fresh wound there starts it over); heavy
// bleeding never stops without a tourniquet or gauze. Bleeding drains blood (100 to start): low blood hurts your aim and pace, very low puts you down, none is
// death. Pain (fractures, wrecked parts, bleeding) throws your aim; painkillers hold it off for two minutes.
// A punctured lung and blood loss work through painkillers; leg fractures slow you whatever you've taken.
//
// Field treatment, each for one injury on one part (and it takes time, see js/invui.js):
//   bandage (light bleed, anywhere), tourniquet (heavy bleed, arm or leg), hemostatic gauze (heavy bleed,
//   anywhere), chest seal (punctured lung), splint (fracture, arm or leg), painkillers (pain, two minutes),
//   blood bag (40% blood back: on yourself before you black out, or on a downed teammate so they can be revived).
// Bandages and painkiller doses stack 4 to a slot, tourniquets and gauze 3; the rest are one each.
// A gut wound can't be fixed in the field. Everything heals at the quartermaster's.
G.Med = (() => {
  const PARTS = [
    ['head', 'Head', 35], ['thorax', 'Thorax', 85], ['stomach', 'Stomach', 70],
    ['armL', 'Left arm', 60], ['armR', 'Right arm', 60], ['legL', 'Left leg', 65], ['legR', 'Right leg', 65],
  ];
  const NAME = Object.fromEntries(PARTS.map(([k, n]) => [k, n]));
  const LIMBS = ['armL', 'armR', 'legL', 'legR'];
  const isLimb = (p) => LIMBS.includes(p);
  // medical items: what each fixes, where, how long it takes (s), its footprint and price
  const ITEMS = {
    bandage: { name: 'Bandage', fixes: 'light', where: 'any', time: 3, size: [1, 1], price: 40, stack: 4, desc: 'Stops light bleeding, anywhere.' },
    tourniquet: { name: 'Tourniquet', fixes: 'heavy', where: 'limb', time: 3, size: [1, 1], price: 80, stack: 3, desc: 'Stops heavy bleeding from an arm or a leg.' },
    gauze: { name: 'Hemostatic gauze', fixes: 'heavy', where: 'any', time: 5, size: [1, 1], price: 120, stack: 3, desc: 'Packed into the wound: stops heavy bleeding anywhere, the torso too.' },
    seal: { name: 'Chest seal', fixes: 'lung', where: ['thorax'], time: 4, size: [1, 1], price: 150, desc: 'Seals a punctured lung: you can breathe again.' },
    splint: { name: 'Splint', fixes: 'frac', where: 'limb', time: 6, size: [1, 2], price: 100, desc: 'Holds a broken arm or leg: no more limp or shaking aim from it.' },
    bloodbag: { name: 'Blood bag', fixes: 'blood', where: 'any', time: 8, size: [1, 2], price: 220, desc: 'A transfusion: 40% of your blood back. Keeps you from blacking out, and brings a downed teammate\'s blood up far enough to revive them.' },
    pills: { name: 'Painkillers', fixes: 'pain', where: 'any', time: 2, size: [1, 1], price: 90, stack: 4, desc: 'A dose: two minutes without pain throwing your aim. Doesn\'t fix anything.' },
  };
  const DRAIN = { light: 0.35, heavy: 2.2, gut: 0.08 }; // blood per second
  const PK = 120; // painkillers, seconds
  const BAG = 40; // a blood bag, % blood
  const REVIVE_BLOOD = 25; // too little blood below this to be brought round (a blood bag first)

  function newBody() {
    const parts = {};
    for (const [k, , max] of PARTS) parts[k] = { hp: max, max, light: false, heavy: false, frac: false, tq: false, lung: false, gut: false };
    return { parts, blood: 100, pk: 0 };
  }
  // the part a zone hit lands on (arms and legs: a side, or the one given)
  function partOf(zone, side) {
    const s = side || (Math.random() < 0.5 ? 'L' : 'R');
    if (zone === 'head' || zone === 'face') return 'head';
    if (zone === 'chest') return 'thorax';
    if (zone === 'abdomen') return 'stomach';
    if (zone === 'uarm' || zone === 'farm') return 'arm' + s;
    return 'leg' + s;
  }
  // Damage to a part (points of a 100-point person, as js/data.js wounds), with the chance of injuries.
  // through: how much of the round got through armour (0..1); central: through the middle of the part.
  // Returns what happened to you: null, 'down' or 'dead'.
  function hit(b, part, dmg, central, through = 1, bullet = true) {
    const p = b.parts[part];
    let left = dmg;
    if (p.hp > 0) { const t = Math.min(p.hp, left); p.hp -= t; left -= t; }
    // a wrecked limb or stomach: the rest goes to the thorax
    if (left > 0 && part !== 'head' && part !== 'thorax') b.parts.thorax.hp = Math.max(0, b.parts.thorax.hp - left * 0.7);
    if (bullet && through > 0.2) {
      const r = Math.random() / through;
      if (r < (central ? 0.45 : 0.15)) p.heavy = true;
      else if (r < (central ? 0.9 : 0.7)) bleed(p);
      if (isLimb(part) && Math.random() < (central ? 0.4 : 0.15) * through) p.frac = true;
      if (part === 'thorax' && central && Math.random() < 0.35 * through) p.lung = true;
      if (part === 'stomach' && central && Math.random() < 0.5 * through) p.gut = true;
    } else if (!bullet && Math.random() < 0.5) bleed(p); // fragments
    else if (p.light) p.clot = Math.max(p.clot || 0, 15); // knocked open again
    if (p.heavy && isLimb(part)) p.tq = false; // a new wound past the tourniquet
    if (b.parts.head.hp <= 0) return 'dead';
    if (b.parts.thorax.hp <= 0) return 'down';
    return null;
  }
  // a light bleed starting (or a fresh one on top): it clots by itself in 30-60 s
  function bleed(p) { p.light = true; p.clot = 30 + Math.random() * 30; }
  // bleeding, light bleeds clotting, painkillers wearing off. Returns 'down' / 'dead' when the blood runs low / out.
  function tick(b, dt) {
    let drain = 0;
    for (const p of Object.values(b.parts)) {
      if (p.light && (p.clot = (p.clot == null ? 45 : p.clot) - dt) <= 0) { p.light = false; p.clot = null; }
      if (p.light) drain += DRAIN.light;
      if (p.heavy) drain += DRAIN.heavy;
      if (p.gut) drain += DRAIN.gut;
    }
    b.blood = Math.max(0, b.blood - drain * dt);
    b.pk = Math.max(0, b.pk - dt);
    if (b.blood <= 0) return 'dead';
    if (b.blood <= 15) return 'down';
    return null;
  }
  const bleeding = (b) => Object.values(b.parts).some((p) => p.light || p.heavy);
  // how badly your aim is thrown (0..1): pain (unless painkillers), a punctured lung, blood loss
  function aimPenalty(b) {
    let pain = 0;
    for (const [k, p] of Object.entries(b.parts)) {
      if (p.frac) pain += k.startsWith('arm') ? 0.3 : 0.1;
      if (p.hp <= 0) pain += k.startsWith('arm') ? 0.4 : 0.15;
      else if (p.hp < p.max * 0.5) pain += 0.08;
      if (p.heavy) pain += 0.12;
    }
    if (b.pk > 0) pain *= 0.1;
    const lung = b.parts.thorax.lung ? 0.3 : 0, blood = b.blood < 70 ? (70 - b.blood) / 70 * 0.6 : 0;
    return G.U.clamp(pain + lung + blood, 0, 1);
  }
  // how fast you can move (x walk speed)
  function speedMult(b) {
    let k = 1;
    for (const s of ['legL', 'legR']) { const p = b.parts[s]; if (p.hp <= 0) k *= 0.6; else if (p.frac) k *= 0.72; }
    if (b.parts.thorax.lung) k *= 0.88;
    if (b.blood < 50) k *= 0.75 + b.blood / 200;
    return k;
  }
  // can this item treat this part now? null (yes) or why not
  function cantTreat(b, part, mt) {
    const I = ITEMS[mt], p = b.parts[part];
    if (!I || !p) return 'That isn\'t a medical item';
    if (I.where === 'limb' && !isLimb(part)) return `${I.name}: arms and legs only`;
    if (Array.isArray(I.where) && !I.where.includes(part)) return `${I.name}: ${I.where.map((x) => NAME[x].toLowerCase()).join(', ')} only`;
    if (I.fixes === 'pain') return null;
    if (I.fixes === 'blood') return b.blood >= 90 ? 'Plenty of blood: a transfusion isn\'t needed' : null;
    if (I.fixes === 'light' && !p.light) return p.heavy ? 'A bandage won\'t stop that: it needs a tourniquet or gauze' : `No light bleeding on the ${NAME[part].toLowerCase()}`;
    if (I.fixes === 'heavy' && !p.heavy) return `No heavy bleeding on the ${NAME[part].toLowerCase()}`;
    if (I.fixes === 'frac' && !p.frac) return `The ${NAME[part].toLowerCase()} isn't broken`;
    if (I.fixes === 'lung' && !p.lung) return 'No punctured lung';
    return null;
  }
  function treat(b, part, mt) {
    if (cantTreat(b, part, mt)) return false;
    const I = ITEMS[mt], p = b.parts[part];
    if (I.fixes === 'pain') b.pk = PK;
    else if (I.fixes === 'blood') b.blood = Math.min(100, b.blood + BAG);
    else if (I.fixes === 'light') p.light = false;
    else if (I.fixes === 'heavy') { p.heavy = false; if (mt === 'tourniquet') p.tq = true; }
    else if (I.fixes === 'frac') p.frac = false;
    else if (I.fixes === 'lung') p.lung = false;
    return true;
  }
  // brought round by a teammate: the thorax holding again, enough blood to stand
  // brought round by a teammate: the thorax holding again (the blood has to be there already: cantRevive)
  function revive(b) { b.parts.thorax.hp = Math.max(b.parts.thorax.hp, 20); }
  const cantRevive = (b) => (b && b.blood < REVIVE_BLOOD ? 'Too little blood to bring them round: a blood bag first' : null);
  // overall, for the team display (0..100)
  const overall = (b) => Math.max(0, Math.min(b.blood, b.parts.thorax.hp / b.parts.thorax.max * 100, b.parts.head.hp / b.parts.head.max * 100));

  // over the network: [hp %, flags] per part, blood, painkillers on
  const FLAGS = ['light', 'heavy', 'frac', 'tq', 'lung', 'gut'];
  function encode(b) {
    return { p: PARTS.map(([k]) => { const q = b.parts[k]; return [Math.round(q.hp / q.max * 100), FLAGS.reduce((a, f, i) => a | (q[f] ? 1 << i : 0), 0)]; }), bl: Math.round(b.blood), pk: b.pk > 0 ? 1 : 0 };
  }
  function decode(e) {
    const b = newBody();
    if (!e || !e.p) return b;
    PARTS.forEach(([k], i) => { const q = b.parts[k], [hp, fl] = e.p[i] || [100, 0]; q.hp = q.max * hp / 100; FLAGS.forEach((f, j) => (q[f] = !!(fl & (1 << j)))); });
    b.blood = e.bl; b.pk = e.pk ? 1 : 0;
    return b;
  }
  // a part's state in words (for tooltips and the inspection panel)
  function describe(p) {
    const out = [];
    if (p.hp <= 0) out.push('destroyed');
    if (p.heavy) out.push('heavy bleeding');
    if (p.light) out.push('bleeding');
    if (p.frac) out.push('fracture');
    if (p.lung) out.push('punctured lung');
    if (p.gut) out.push('gut wound');
    if (p.tq) out.push('tourniquet on');
    return out;
  }
  // ---------------------------------------------------------------- the body, drawn
  // An officer seen from behind (your left is on the left), to the rig's proportions: 1.85 m tall, hips at
  // 0.95 m, shoulders 0.42 m across, the arms hanging a little out from the body. Units are centimetres from
  // the top of the helmet. Each part is filled by its health, outlined red (pulsing) while it bleeds, dashed
  // yellow when it's broken; a tourniquet shows as a strap. Every part carries data-body, so it's a drop
  // target for medical items in the Tab screen.
  const SHAPES = {
    head: 'M39 22 Q39 6 50 5 Q61 6 61 22 Q61 30 56 32 L44 32 Q39 30 39 22 Z',
    thorax: 'M29 41 Q31 36 44 34 L56 34 Q69 36 71 41 L69 68 L31 68 Z',
    stomach: 'M31 70 L69 70 L67 91 Q50 95 33 91 Z',
    armL: 'M27 41 Q22 42 21 49 L18 72 L15 99 Q14 105 19 106 Q23 106 23 100 L26 74 L29 52 Z',
    armR: 'M73 41 Q78 42 79 49 L82 72 L85 99 Q86 105 81 106 Q77 106 77 100 L74 74 L71 52 Z',
    legL: 'M33 93 Q41 96 49 95 L48 135 L46 176 L47 184 L34 185 L35 176 L34 135 Z',
    legR: 'M67 93 Q59 96 51 95 L52 135 L54 176 L53 184 L66 185 L65 176 L66 135 Z',
  };
  // where a tourniquet goes on each limb (high on it), [x1, y1, x2, y2]
  const TQ = { armL: [19, 52, 29, 54], armR: [71, 54, 81, 52], legL: [33, 104, 49, 104], legR: [51, 104, 67, 104] };
  function figure(b, opts = {}) {
    const part = (k) => {
      const p = b.parts[k], f = Math.max(0, p.hp / p.max);
      const fill = p.hp <= 0 ? '#2a1010' : `hsl(${Math.round(f * 105)}, 42%, ${24 + f * 16}%)`;
      const cls = `fp${p.heavy || p.light ? ' bleed' : ''}${p.heavy ? ' heavy' : ''}${p.frac ? ' frac' : ''}${p.lung || p.gut ? ' organ' : ''}`;
      const tip = `${NAME[k]}: ${Math.ceil(Math.max(0, p.hp))}/${p.max}${describe(p).length ? ' · ' + describe(p).join(', ') : ''}`;
      const tq = p.tq && TQ[k] ? `<line x1="${TQ[k][0]}" y1="${TQ[k][1]}" x2="${TQ[k][2]}" y2="${TQ[k][3]}" class="ftq"/>` : '';
      return `<path d="${SHAPES[k]}" class="${cls}" style="fill:${fill}" data-body="${k}"><title>${tip}</title></path>${tq}`;
    };
    // the head over the rest, the arms over the torso's edges
    const order = ['legL', 'legR', 'stomach', 'thorax', 'armL', 'armR', 'head'];
    // kit lines over the top (not drop targets): the helmet's brim, the plate carrier's edges, the belt
    const kit = '<g class="fkit"><path d="M38 23 Q50 26 62 23"/><path d="M36 40 L37 66 M64 40 L63 66"/><path d="M32 89 Q50 93 68 89"/></g>';
    return `<svg class="figure ${opts.cls || ''}" viewBox="0 0 100 190" ${opts.w ? `width="${opts.w}"` : ''} xmlns="http://www.w3.org/2000/svg">${order.map(part).join('')}${kit}</svg>`;
  }
  return { PARTS, NAME, ITEMS, LIMBS, figure, isLimb, newBody, partOf, hit, tick, bleeding, aimPenalty, speedMult, cantTreat, treat, revive, cantRevive, REVIVE_BLOOD, overall, encode, decode, describe };
})();
