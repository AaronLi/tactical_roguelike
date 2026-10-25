'use strict';
// Stickers: pictures you stick on your guns, for good.
//
// WHICH: whatever pictures are in assets/stickers/ (its index.json, a list of their file names, if it has one; else
// the folder's listing, which serve.js and most static servers give). Found in levels (a small sticker box in about
// one in ten: js/level.js, the host's pick of what's in it: js/server.js), kept in your collection (this browser's,
// across runs: owned / give / use), each stuck on one gun used up.
//
// ON A GUN: w.stickers, a list of { s: file name, p: where on the gun, n: the surface's normal there (the gun's model
// space: its bore along -Z, up +Y), r: turned about n (rad), k: its longest side (m), f: mirrored }. Drawn as decals:
// the picture projected onto the gun's own surfaces in a small box round p (clipped to it, only what faces out along
// n), so it wraps round an edge or a curve as a real sticker would, and moves with the part it's on (a slide, a mag).
// The same on your viewmodel, the gunsmith's model, your body as others see it, a gun lying on the floor, the replays.
//
// THE SQUAD: a gun's list is sent once (to the host, who passes it on and keeps it for anyone joining later: share),
// then only its hash, in your state (st.sk: js/player.js state), which everyone looks up (of).
G.Stickers = (() => {
  const DIR = 'assets/stickers/', EXT = /\.(png|webp|jpe?g|gif|avif)$/i;
  const S = { base: '', names: [], MAX: 12, MIN_K: 0.012, MAX_K: 0.07 }; // (MAX on a gun; k's range, m. base: the game's folder, from a worker's: js/exportworker.js)
  const ok = (n) => typeof n === 'string' && n.length < 100 && EXT.test(n) && !/[\\/]|^\./.test(n);

  // ---------------------------------------------------------------- which there are
  let loading = null;
  function load() {
    if (loading) return loading;
    const names = (a) => [...new Set(a.map((n) => { try { return decodeURIComponent(String(n)).split('/').pop(); } catch (e) { return ''; } }).filter(ok))].sort();
    loading = fetch(S.base + DIR + 'index.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('no index'))))
      .catch(() => fetch(S.base + DIR, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((t) => [...t.matchAll(/href\s*=\s*["']([^"'?#]+)["']/gi)].map((m) => m[1])))
      .catch(() => []).then((a) => (S.names = names(Array.isArray(a) ? a : [])));
    return loading;
  }
  const url = (name) => S.base + DIR + encodeURIComponent(name);

  // ---------------------------------------------------------------- your collection (name -> how many)
  const owned = () => { const o = G.U.store.get('stickers', {}); return o && typeof o === 'object' ? o : {}; };
  function give(name) { if (!ok(name)) return; const o = owned(); o[name] = (o[name] || 0) + 1; G.U.store.set('stickers', o); }
  function use(name) { const o = owned(); if (!o[name]) return false; if (--o[name] <= 0) delete o[name]; G.U.store.set('stickers', o); return true; }

  // ---------------------------------------------------------------- the pictures
  // name -> { bm: its ImageBitmap once loaded, w, h, ready (a promise), bad, tex, mat, ghost (a placement's preview) }
  const pics = new Map();
  function pic(name) {
    let p = pics.get(name);
    if (!p) {
      p = { bm: null, w: 1, h: 1, bad: false, tex: null, mat: null, ghost: null };
      pics.set(name, p);
      p.ready = ok(name) ? fetch(url(name)).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status)))).then((b) => createImageBitmap(b)).then((bm) => set(p, bm)).catch(() => { p.bad = true; return p; })
        : Promise.resolve((p.bad = true, p));
    }
    return p;
  }
  function set(p, bm) {
    p.bm = bm; p.w = bm.width || 1; p.h = bm.height || 1; p.bad = false;
    if (p.tex) { p.tex.image = bm; p.tex.needsUpdate = true; }
    return p;
  }
  // a picture handed over (a replay's file brought its own: js/highlights.js renderPack, in the worker)
  function provide(name, bm) { const p = pics.get(name) || pic(name); set(p, bm); p.ready = Promise.resolve(p); }
  function material(name, ghost) {
    const p = pic(name);
    if (!p.tex) {
      // (an ImageBitmap isn't turned over on upload: its top row is v = 0, as the decals' UVs have it)
      p.tex = new THREE.Texture(p.bm || undefined); p.tex.flipY = false; p.tex.encoding = THREE.sRGBEncoding; p.tex.anisotropy = 4;
      if (p.bm) p.tex.needsUpdate = true;
    }
    const k = ghost ? 'ghost' : 'mat';
    if (!p[k]) {
      // vinyl: a little glossier than a polymer frame, drawn over the surface it's on (pulled toward the camera in depth)
      p[k] = new THREE.MeshStandardMaterial({ map: p.tex, transparent: true, alphaTest: 0.03, depthWrite: false, roughness: 0.45, metalness: 0.0,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, opacity: ghost ? 0.75 : 1 });
      if (ghost) p[k].emissive = new THREE.Color(0x10202c);
    }
    return p[k];
  }

  // ---------------------------------------------------------------- tidy data (from anyone)
  const num = (v, lo, hi, d = 0) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  function clean(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const s of list.slice(0, S.MAX)) {
      if (!s || !ok(s.s) || !Array.isArray(s.p) || !Array.isArray(s.n)) continue;
      const n = new THREE.Vector3(num(s.n[0], -1, 1), num(s.n[1], -1, 1), num(s.n[2], -1, 1));
      if (n.lengthSq() < 1e-6) continue;
      n.normalize();
      out.push({ s: s.s, p: s.p.slice(0, 3).map((v) => r4(num(v, -3, 3))), n: [r4(n.x), r4(n.y), r4(n.z)], r: r4(num(s.r, -Math.PI, Math.PI)), k: r4(num(s.k, S.MIN_K, S.MAX_K, 0.03)), f: s.f ? 1 : 0 });
    }
    return out;
  }

  // ---------------------------------------------------------------- decals
  // A sticker's box in the gun's space: x across the picture, y up it, z out of the surface (unit box: -0.5..0.5 each
  // way). Upright as seen from in front of it with the gun's up (+Y) as up (from above or below: its back, +Z), then
  // turned by r; as deep as half its size (from 6 mm to 2.5 cm), so it reaches round an edge but not through to the far side
  function frame(s, aspect) {
    const n = new THREE.Vector3(...s.n).normalize(), ref = Math.abs(n.y) > 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(ref, n).normalize(), y = new THREE.Vector3().crossVectors(n, x);
    const c = Math.cos(s.r), sn = Math.sin(s.r), xr = x.clone().multiplyScalar(c).addScaledVector(y, sn), yr = y.clone().multiplyScalar(c).addScaledVector(x, -sn);
    const w = aspect >= 1 ? s.k : s.k * aspect, h = aspect >= 1 ? s.k / aspect : s.k, d = Math.min(0.025, Math.max(0.006, s.k * 0.5));
    return new THREE.Matrix4().makeBasis(xr.multiplyScalar(s.f ? -w : w), yr.multiplyScalar(h), n.clone().multiplyScalar(d)).setPosition(new THREE.Vector3(...s.p));
  }
  // the meshes under a gun's root a sticker can go on (its own parts: not a sight's glass, a glow, a sticker), each with
  // its place in the root's frame, as they are now
  function surfaces(root) {
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert(), out = [];
    root.traverse((o) => {
      if (!o.isMesh || o.userData.sticker || o.userData.noSticker || !o.geometry || !o.geometry.attributes.position) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.transparent || m.isMeshBasicMaterial || m.isShaderMaterial) return;
      out.push({ mesh: o, rel: inv.clone().multiply(o.matrixWorld) });
    });
    return out;
  }
  // a polygon (points { p in the sticker's box, n the surface's normal in the mesh's frame }) cut down to one face of the box
  function cut(poly, ax, sg) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], da = sg * a.p[ax] - 0.5, db = sg * b.p[ax] - 0.5;
      if (da <= 0) out.push(a);
      if ((da <= 0) !== (db <= 0)) { const t = da / (da - db); out.push({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t) }); }
    }
    return out;
  }
  const BOX = [new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)];
  // one sticker on one mesh: the triangles of it inside its box that face out its way, clipped to the box, as a geometry
  // in the mesh's frame (or null: it doesn't touch it)
  function onMesh(sf, F, nOut) {
    const geo = sf.mesh.geometry, Dm = sf.rel.clone().invert().multiply(F), Di = Dm.clone().invert();
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox.clone().applyMatrix4(Di);
    if (bb.min.x > 0.5 || bb.max.x < -0.5 || bb.min.y > 0.5 || bb.max.y < -0.5 || bb.min.z > 0.5 || bb.max.z < -0.5) return null;
    const pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index, cnt = idx ? idx.count : pos.count;
    const nm = new THREE.Matrix3().getNormalMatrix(sf.rel), P = [], N = [], UV = [];
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3(), wn = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i + 2 < cnt; i += 3) {
      const ids = [0, 1, 2].map((j) => (idx ? idx.getX(i + j) : i + j));
      for (let j = 0; j < 3; j++) v[j].fromBufferAttribute(pos, ids[j]);
      fn.crossVectors(e1.subVectors(v[1], v[0]), e2.subVectors(v[2], v[0]));
      if (fn.lengthSq() < 1e-16) continue;
      fn.normalize();
      if (wn.copy(fn).applyMatrix3(nm).normalize().dot(nOut) < 0.25) continue; // (facing away: the far side, a wall at right angles)
      let poly = v.map((p, j) => ({ p: p.clone().applyMatrix4(Di), n: nor ? new THREE.Vector3().fromBufferAttribute(nor, ids[j]) : fn.clone() }));
      if (poly.every((a) => a.p.x > 0.5) || poly.every((a) => a.p.x < -0.5) || poly.every((a) => a.p.y > 0.5) || poly.every((a) => a.p.y < -0.5) || poly.every((a) => a.p.z > 0.5) || poly.every((a) => a.p.z < -0.5)) continue;
      for (const ax of ['x', 'y', 'z']) { poly = cut(poly, ax, 1); if (poly.length < 3) break; poly = cut(poly, ax, -1); if (poly.length < 3) break; }
      if (poly.length < 3) continue;
      for (let j = 1; j + 1 < poly.length; j++) for (const a of [poly[0], poly[j], poly[j + 1]]) {
        q.copy(a.p).applyMatrix4(Dm); P.push(q.x, q.y, q.z);
        const an = a.n.lengthSq() > 1e-8 ? a.n.clone().normalize() : fn; N.push(an.x, an.y, an.z);
        UV.push(a.p.x + 0.5, 0.5 - a.p.y);
      }
    }
    if (!P.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.computeBoundingSphere();
    return g;
  }
  // one sticker on the gun: its pieces, each a child of the mesh it's on (so it moves with it)
  function place(sfs, s, ghost) {
    const p = pic(s.s);
    if (!p.bm) return [];
    const F = frame(s, p.w / p.h), nOut = new THREE.Vector3(...s.n).normalize(), mat = material(s.s, ghost), out = [];
    for (const sf of sfs) {
      const g = onMesh(sf, F, nOut);
      if (!g) continue;
      const m = new THREE.Mesh(g, mat);
      m.userData.sticker = ghost ? 'ghost' : 1; m.renderOrder = (sf.mesh.renderOrder || 0) + 1; m.layers.mask = sf.mesh.layers.mask; m.castShadow = false;
      sf.mesh.add(m); out.push(m);
    }
    return out;
  }
  function strip(root, kind) {
    const gone = [];
    root.traverse((o) => { if (o.userData.sticker && (kind == null || o.userData.sticker === kind)) gone.push(o); });
    for (const o of gone) { o.removeFromParent(); o.geometry.dispose(); }
  }
  // A gun's stickers on its model (root: the model's root, the gun's own frame): any it had come off first. The meshes
  // are taken as they are now; a picture still loading goes on when it's in (if the model hasn't been given others since).
  function decorate(root, skin) {
    if (!root) return;
    strip(root, 1);
    const list = clean(skin);
    if (!list.length) return;
    const gen = root.userData.stkGen = (root.userData.stkGen || 0) + 1, sfs = surfaces(root);
    const go = () => { if (root.userData.stkGen === gen) for (const s of list) place(sfs, s); };
    const wait = list.map((s) => pic(s.s)).filter((p) => !p.bm && !p.bad);
    if (wait.length) Promise.all(wait.map((p) => p.ready)).then(go); else go();
  }
  // a placement being tried (the gunsmith's sticker tool): shown faint, any other tried one gone; null clears it
  function ghost(root, s) {
    if (!root) return;
    strip(root, 'ghost');
    root.userData.stkGhost = s;
    if (!s) return;
    const p = pic(s.s);
    if (p.bm) place(surfaces(root), s, true);
    else if (!p.bad) p.ready.then(() => { if (root.userData.stkGhost === s) ghost(root, s); }); // (its picture still loading: on when it's in, if it's still the one being tried)
  }

  // ---------------------------------------------------------------- the squad: a list's hash, and the lists by hash
  const hashes = new WeakMap(), reg = new Map(), sent = new Set(), asked = new Map();
  function key(skin) {
    if (!skin || !skin.length) return '';
    let h = hashes.get(skin);
    if (h == null) {
      const str = JSON.stringify(clean(skin));
      let x = 2166136261; for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 16777619);
      h = 's' + (x >>> 0).toString(36) + str.length.toString(36);
      hashes.set(skin, h);
    }
    return h;
  }
  // yours: told to the squad (once), its hash for your state
  function share(skin) {
    const h = key(skin);
    if (h && !sent.has(h) && G.Net && G.Net.myId) { sent.add(h); reg.set(h, clean(skin)); G.Net.toHost({ t: 'skin', h, l: clean(skin) }); }
    return h;
  }
  // someone's, by its hash (null till it's known: asked for, now and then)
  function of(h) {
    if (!h || typeof h !== 'string') return null;
    const l = reg.get(h);
    if (l) return l;
    const t = performance.now();
    if (!(asked.get(h) > t - 3000) && G.Net && G.Net.myId) { asked.set(h, t); G.Net.toHost({ t: 'skinReq', h }); }
    return null;
  }
  function learn(h, l) { if (typeof h === 'string' && h.length < 24) reg.set(h, clean(l)); }
  // joined a game: what this host has heard of, and ours to tell it again
  function joined(list) { sent.clear(); for (const [h, l] of Array.isArray(list) ? list : []) learn(h, l); }

  return Object.assign(S, { load, url, owned, give, use, pic, provide, material, clean, decorate, ghost, key, share, of, learn, joined });
})();
