'use strict';
// Injuries, for the officers (suspects keep a simpler record of the same wounds: js/server.js injure).
//
// The body is seven parts, each with its own health: head 35, thorax 85, stomach 70, arms 60, legs 65, and the
// organs inside them (js/ballistics.js: brain, heart, lungs, liver, spine, the long bones, the big arteries...). A
// round's track through you (worked out physically, js/ballistics.js) takes health from the parts it crosses and
// leaves what it did to the organs it went through:
//   bleeding (light, heavy, or massive: the heart, the aorta, an iliac artery), a fracture (a long bone), a punctured
//   lung (a lung, the airway), a gut wound (stomach, bowel), a spinal injury (you're down and can't get up), or the
//   end (the brain, the brainstem, the spine in the neck).
// What a hit mostly does, though, is cost blood (100 to start): at once, as the wound opens, and then for as long as
// it bleeds. Blood is what decides whether you're up:
//   over 40%: up, however hurt;
//   40% or less: one more hit, anywhere, puts you down;
//   15% or less: unconscious;
//   none: dead.
// A part at zero only stops working (an arm that won't hold the gun steady, a leg that won't carry you, a chest that
// can't get a breath in); it doesn't put you down by itself. The head is the exception: an unarmoured head is still
// a kill, and so is the head at zero.
// Down, you bleed slowly (a sixteenth of the rate standing, but nothing clots any more), until the blood's gone. A
// teammate gets a downed (conscious) officer up with a revive; an unconscious one needs blood bags first, to come
// round. Stop the bleeding before that, or it carries on where it left off: and with low blood, the next hit puts you
// straight back down.
// Light bleeding clots by itself in 30-60 s (a bandage stops it at once; a fresh wound there starts it over); heavy
// bleeding never stops without a tourniquet or gauze. Low blood hurts your aim and pace.
// Pain (fractures, wrecked parts, bleeding) throws your aim; painkillers hold it off for two minutes.
// A punctured lung and blood loss work through painkillers; leg fractures slow you whatever you've taken.
//
// Field treatment, each for one injury on one part (and it takes time, see js/invui.js):
//   bandage (light bleed, anywhere), tourniquet (heavy bleed, arm or leg), hemostatic gauze (heavy or light bleed,
//   anywhere), chest seal (punctured lung), splint (fracture, arm or leg), painkillers (pain, two minutes),
//   blood bag (40% blood back: on yourself, or on a teammate; an unconscious one comes round with it).
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
    gauze: { name: 'Hemostatic gauze', fixes: 'heavy', light: true, where: 'any', time: 5, size: [1, 1], price: 120, stack: 3, desc: 'Packed into the wound: stops heavy bleeding anywhere, the torso too. Works as a bandage on lighter bleeding too.' },
    seal: { name: 'Chest seal', fixes: 'lung', where: ['thorax'], time: 4, size: [1, 1], price: 150, desc: 'Seals a punctured lung: you can breathe again.' },
    splint: { name: 'Splint', fixes: 'frac', where: 'limb', time: 6, size: [1, 2], price: 100, desc: 'Holds a broken arm or leg: no more limp or shaking aim from it.' },
    bloodbag: { name: 'Blood bag', fixes: 'blood', where: 'any', time: 8, size: [1, 2], price: 220, desc: 'A transfusion: 40% of your blood back. Keeps you out of the range where one more hit puts you down, and brings an unconscious teammate round.' },
    pills: { name: 'Painkillers', fixes: 'pain', where: 'any', time: 2, size: [1, 1], price: 90, stack: 4, desc: 'A dose: two minutes without pain throwing your aim. Doesn\'t fix anything.' },
  };
  const BLEED_K = 0.5; // everyone bleeds at this share of the rates below (suspects too: js/server.js BLEED_K)
  const DRAIN = { light: 0.35, heavy: 2.2, massive: 8, gut: 0.08 }; // blood per second, before BLEED_K (massive: gone in about 25 s)
  const PK = 120; // painkillers, seconds
  const BAG = 40; // a blood bag, % blood
  const DOWNABLE = 40; // this much blood or less: the next hit puts you down
  const UNCON = 15; // this much or less: unconscious (blood bags bring you round)
  const DOWN_K = 0.06; // down: bleeding this much slower (you're still, your pressure's low)
  // blood lost at once to a wound, per point of damage (the torso bleeds most; the head's a different matter)
  const HIT_BLOOD = { head: 0, thorax: 0.55, stomach: 0.55, limb: 0.35, frag: 0.3 };

  function newBody() {
    const parts = {};
    for (const [k, , max] of PARTS) parts[k] = { hp: max, max, light: false, heavy: false, massive: false, frac: false, tq: false, lung: false, gut: false, spine: false, org: {} }; // org: organ id -> share of it gone (0..1)
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
  // Damage to a part (points of a 100-point person, as js/data.js wounds), with the chance of injuries, and the
  // blood it costs. through: how much of the round got through armour (0..1); central: through the middle of the part.
  // Returns what happened to you: null, 'down', 'out' (unconscious) or 'dead'.
  function hit(b, part, dmg, central, through = 1, bullet = true) {
    const p = b.parts[part], downable = b.blood <= DOWNABLE; // (low already: this is the hit that puts you down)
    p.hp = Math.max(0, p.hp - dmg); // (a part at zero only stops working: js/medical.js aimPenalty, speedMult)
    // (a wound alone never empties you: at worst it knocks you out, and the bleeding finishes it unless someone stops it)
    b.blood = Math.max(Math.min(b.blood, 1), b.blood - dmg * (bullet ? HIT_BLOOD[isLimb(part) ? 'limb' : part] : HIT_BLOOD.frag));
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
    return fateOf(b, downable && dmg > 0);
  }
  // A round's track through one part (js/ballistics.js effects): its damage (points of a 100-point person), what it
  // did (effects), and the organs it went through ([id, damage, hp]). Returns your fate, as hit() does.
  function wound(b, part, dmg, effects, organs) {
    const p = b.parts[part], downable = b.blood <= DOWNABLE, E = new Set(effects || []);
    if (!p) return null;
    p.hp = Math.max(0, p.hp - dmg);
    b.blood = Math.max(Math.min(b.blood, 1), b.blood - dmg * HIT_BLOOD[isLimb(part) ? 'limb' : part === 'head' ? 'thorax' : part]);
    for (const [id, d, hp] of organs || []) p.org[id] = Math.min(1, (p.org[id] || 0) + d / hp);
    if (E.has('dead')) { b.parts.head.hp = 0; return 'dead'; }
    if (E.has('massive')) p.massive = true;
    if (E.has('heavy')) { p.heavy = true; if (isLimb(part)) p.tq = false; } // (a new wound past the tourniquet)
    if (E.has('light') && !p.heavy) bleed(p);
    if (E.has('frac')) { if (isLimb(part)) p.frac = true; else { const pl = (organs || []).find(([id]) => id === 'pelvisL' || id === 'pelvisR'); b.parts[pl ? 'leg' + pl[0].slice(-1) : Math.random() < 0.5 ? 'legL' : 'legR'].frac = true; } } // (the pelvis: the leg on its side won't take your weight)
    if (E.has('lung')) b.parts.thorax.lung = true;
    if (E.has('gut')) p.gut = true;
    // (a spinal hit lower than the neck doesn't paralyse an officer: it's its damage and bleeding, like any other. The
    // neck's is the end: 'dead', above. p.spine stays in the state for its format.)
    if (E.has('out')) b.blood = Math.min(b.blood, UNCON); // (the heart wrecked: you black out where you stand)
    return fateOf(b, downable && dmg > 0);
  }
  const paralysed = (b) => Object.values(b.parts).some((p) => p.spine);
  // where your blood (and your head) leave you: dead, unconscious, down (hit: you were just hit, or your spine's
  // gone), or up (null)
  function fateOf(b, hit) {
    if (b.parts.head.hp <= 0 || b.blood <= 0) return 'dead';
    if (b.blood <= UNCON) return 'out';
    return hit || paralysed(b) ? 'down' : null;
  }
  // a light bleed starting (or a fresh one on top): it clots by itself in 30-60 s
  function bleed(p) { p.light = true; p.clot = 30 + Math.random() * 30; }
  // blood lost per second (down: slower, see DOWN_K)
  function drainOf(b, down) {
    let d = 0;
    for (const p of Object.values(b.parts)) d += (p.light ? DRAIN.light : 0) + (p.heavy ? DRAIN.heavy : 0) + (p.massive ? DRAIN.massive : 0) + (p.gut ? DRAIN.gut : 0);
    d *= BLEED_K;
    return down ? d * DOWN_K : d;
  }
  // down: seconds until you've bled out, or null when nothing's bleeding (stable)
  function bleedOut(b) { const d = drainOf(b, true); return d > 0 ? b.blood / d : null; }
  // bleeding, light bleeds clotting (not once you're down), painkillers wearing off. Returns 'out' / 'dead' when the
  // blood runs very low / out (low blood alone doesn't put you down: the next hit does).
  function tick(b, dt, down) {
    if (!down) for (const p of Object.values(b.parts)) if (p.light && (p.clot = (p.clot == null ? 45 : p.clot) - dt) <= 0) { p.light = false; p.clot = null; }
    b.blood = Math.max(0, b.blood - drainOf(b, down) * dt);
    b.pk = Math.max(0, b.pk - dt);
    return fateOf(b, false);
  }
  const downable = (b) => b.blood <= DOWNABLE;
  const unconscious = (b) => b.blood <= UNCON;
  const bleeding = (b) => Object.values(b.parts).some((p) => p.light || p.heavy || p.massive);
  // how badly your aim is thrown (0..1): pain (unless painkillers), a punctured lung, blood loss
  function aimPenalty(b) {
    let pain = 0;
    for (const [k, p] of Object.entries(b.parts)) {
      if (p.frac) pain += k.startsWith('arm') ? 0.3 : 0.1;
      if (p.hp <= 0) pain += k.startsWith('arm') ? 0.4 : 0.15;
      else if (p.hp < p.max * 0.5) pain += 0.08;
      if (p.heavy || p.massive) pain += 0.12;
    }
    if (b.pk > 0) pain *= 0.1;
    const lung = b.parts.thorax.lung || b.parts.thorax.hp <= 0 ? 0.3 : 0, blood = b.blood < 70 ? (70 - b.blood) / 70 * 0.6 : 0;
    return G.U.clamp(pain + lung + blood, 0, 1);
  }
  // how fast you can move (x walk speed)
  function speedMult(b) {
    let k = 1;
    for (const s of ['legL', 'legR']) { const p = b.parts[s]; if (p.hp <= 0) k *= 0.6; else if (p.frac) k *= 0.72; }
    if (b.parts.thorax.lung || b.parts.thorax.hp <= 0) k *= 0.88; // (a wrecked chest: short of breath)
    if (b.parts.stomach.hp <= 0) k *= 0.9;
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
    if (I.fixes === 'heavy' && p.massive && !p.heavy && !p.light) return `That bleeding's inside the ${NAME[part].toLowerCase()}: nothing out here stops it`;
    if (I.fixes === 'heavy' && !p.heavy && !(I.light && p.light)) return `No ${I.light ? '' : 'heavy '}bleeding on the ${NAME[part].toLowerCase()}`; // (gauze: a bandage too)
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
    else if (I.fixes === 'heavy') { if (p.heavy) { p.heavy = false; if (mt === 'tourniquet') p.tq = true; } else p.light = false; } // (gauze on a light bleed: as a bandage)
    else if (I.fixes === 'frac') p.frac = false;
    else if (I.fixes === 'lung') p.lung = false;
    return true;
  }
  // A downed officer gets up with a teammate's help; an unconscious one has to come round first (blood bags)
  function cantRevive(b) {
    if (!b) return null;
    if (paralysed(b)) return 'A spinal injury: they can\'t stand, whatever you do here';
    if (unconscious(b)) return `Unconscious: blood bags first (${Math.round(b.blood)}% blood, they come round over ${UNCON}%)`;
    return null;
  }
  // what's worth saying before a revive: what'll put them straight back down
  function reviveWarn(b) {
    if (!b) return null;
    if (bleeding(b)) return 'Still bleeding: they\'ll keep losing blood once up';
    if (downable(b)) return `Low blood (${Math.round(b.blood)}%): the next hit puts them down again`;
    return null;
  }
  // overall, for the team display (0..100): blood, unless the head's worse
  const overall = (b) => Math.max(0, Math.min(b.blood, b.parts.head.hp / b.parts.head.max * 100));

  // over the network: [hp %, flags] per part, blood, painkillers on
  const FLAGS = ['light', 'heavy', 'frac', 'tq', 'lung', 'gut', 'massive', 'spine'];
  function encode(b) {
    return { p: PARTS.map(([k]) => { const q = b.parts[k], o = Object.entries(q.org || {}).map(([id, f]) => id + ':' + Math.round(f * 100)).join(','); return o ? [Math.round(q.hp / q.max * 100), FLAGS.reduce((a, f, i) => a | (q[f] ? 1 << i : 0), 0), o] : [Math.round(q.hp / q.max * 100), FLAGS.reduce((a, f, i) => a | (q[f] ? 1 << i : 0), 0)]; }), bl: Math.round(b.blood), pk: b.pk > 0 ? 1 : 0 };
  }
  function decode(e) {
    const b = newBody();
    if (!e || !e.p) return b;
    PARTS.forEach(([k], i) => { const q = b.parts[k], [hp, fl, o] = e.p[i] || [100, 0]; q.hp = q.max * hp / 100; FLAGS.forEach((f, j) => (q[f] = !!(fl & (1 << j)))); if (o) for (const s of String(o).split(',')) { const [id, pc] = s.split(':'); if (id) q.org[id] = (+pc || 0) / 100; } });
    b.blood = e.bl; b.pk = e.pk ? 1 : 0;
    return b;
  }
  // a part's state in words (for tooltips and the inspection panel)
  function describe(p) {
    const out = [];
    if (p.hp <= 0) out.push('destroyed');
    if (p.massive) out.push('internal bleeding');
    if (p.heavy) out.push('heavy bleeding');
    if (p.light) out.push('bleeding');
    if (p.frac) out.push('fracture');
    if (p.lung) out.push('punctured lung');
    if (p.gut) out.push('gut wound');
    if (p.spine) out.push('spinal injury');
    if (p.tq) out.push('tourniquet on');
    // the organs it went through: grazed, or wrecked
    for (const [id, f] of Object.entries(p.org || {})) { const O = G.Ballistics && G.Ballistics.ORG[id]; if (O && f > 0.02) out.push(`${O.label.toLowerCase()} ${f >= 1 ? 'destroyed' : f >= 0.5 ? 'badly hurt' : 'hit'}`); }
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
      const cls = `fp${p.heavy || p.light || p.massive ? ' bleed' : ''}${p.heavy || p.massive ? ' heavy' : ''}${p.frac ? ' frac' : ''}${p.lung || p.gut ? ' organ' : ''}${opts.glow && opts.glow.includes(k) ? ' treating' : ''}`; // (glow: parts a teammate is working on)
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
  return { PARTS, NAME, ITEMS, LIMBS, figure, isLimb, newBody, partOf, hit, wound, paralysed, tick, bleedOut, bleeding, aimPenalty, speedMult, cantTreat, treat, cantRevive, reviveWarn, downable, unconscious, DOWNABLE, UNCON, overall, encode, decode, describe };
})();
