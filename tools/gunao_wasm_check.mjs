// A gun's ambient occlusion in WebAssembly against the JavaScript (js/gunao.ts, js/gunaowasm.ts, wasm/gunao: docs/wasm.md), in the page: a steps
// file for tools/space_shot.mjs (the models are the page's, from the bundles). For each gun the same build is assembled twice and occluded,
// once with the module switched off (G.GunAo.wasm.off) and once with it, the adaptive path (GunAo.GUN: the mesh refined) and the far levels'
// (GunAo.GUN_FAR: nothing split), and GunAo.GUN_ASYNC (the gun in the hands, worked out across frames, each path) against GUN at once; then the ship's (GunAo.SHIP, layered: aOcc, aOccD, aOccI). Every mesh's vertex count, index and attributes
// (positions, normals, uvs, aOcc...) are compared; the largest difference is printed, and any is a FAIL (they should be bit for bit the same).
//   node tools/space_shot.mjs "mute&hangar" tools/gunao_wasm_check.mjs --port 8151 [--gpu]     (a page served by node serve.js, the module built:
//   npm run build:wasm)
export default async ({ ev, sleep, log }) => {
  await sleep(3000);
  const ok = await ev(`G.GunAo.wasm.start().then(() => G.GunAo.wasm.ready)`);
  if (!ok) { log('FAIL the module is not there (' + await ev('G.GunAo.wasm.error') + '): npm run build:wasm'); return; }
  await ev(`(() => {
    const meshes = (g) => { const a = []; g.traverse((o) => { if (o.isMesh) a.push(o); }); return a; };
    window.__aoCmp = (ga, gb) => {
      const A = meshes(ga), B = meshes(gb), r = { meshes: A.length, verts: [0, 0], tris: [0, 0], aoMax: 0, attrMax: 0, bad: [] };
      if (A.length !== B.length) { r.bad.push('mesh count ' + A.length + ' / ' + B.length); return r; }
      A.forEach((ma, i) => {
        const x = ma.geometry, y = B[i].geometry, nx = Object.keys(x.attributes), ny = Object.keys(y.attributes);
        r.verts[0] += x.attributes.position.count; r.verts[1] += y.attributes.position.count;
        r.tris[0] += (x.index ? x.index.count : x.attributes.position.count) / 3; r.tris[1] += (y.index ? y.index.count : y.attributes.position.count) / 3;
        if (nx.join() !== ny.join()) { r.bad.push(i + ': attributes ' + nx + ' / ' + ny); return; }
        if (!!x.index !== !!y.index || (x.index && (x.index.count !== y.index.count || x.index.array.some((v, k) => v !== y.index.array[k])))) r.bad.push(i + ': index');
        for (const n of nx) {
          const p = x.attributes[n], q = y.attributes[n];
          if (p.count !== q.count || p.itemSize !== q.itemSize) { r.bad.push(i + ': ' + n + ' ' + p.count + ' / ' + q.count); continue; }
          let m = 0; for (let k = 0; k < p.count; k++) for (let c = 0; c < p.itemSize; c++) { const d = Math.abs(p.getComponent(k, c) - q.getComponent(k, c)); if (!(d <= m)) m = d; }
          if (/^aOcc/.test(n)) r.aoMax = Math.max(r.aoMax, m); else r.attrMax = Math.max(r.attrMax, m);
        }
      });
      return r;
    };
    return 1; })()`);
  let fails = 0;
  const report = (what, r) => {
    const bad = r.bad.length || r.aoMax !== 0 || r.attrMax !== 0;
    if (bad) fails++;
    log((bad ? 'FAIL ' : 'ok   ') + what + ': ' + JSON.stringify(r));
  };
  for (const id of ['m4', 'scar', 'm249', 'ak', 'barrett', 'm1911', 'usp', 'deagle', 'mp5', 'aug']) {
    const r = await ev(`(async () => {
      const GS = G.Gunsmith, def = GS.fromCode(GS.defaultCode('${id}')); if (!def) return null;
      if (!(await G.Models.ensure(def))) return null;
      const out = {};
      for (const [name, opts, lod] of [['GUN', G.GunAo.GUN, undefined], ['GUN_FAR', G.GunAo.GUN_FAR, 2]]) {
        const a = G.Models.assemble(def, undefined, lod), b = G.Models.assemble(def, undefined, lod); if (!a || !b) continue;
        G.GunAo.wasm.off = true; let t = performance.now(); G.GunAo.apply(a.group, undefined, opts); const js = performance.now() - t;
        G.GunAo.wasm.off = false; t = performance.now(); G.GunAo.apply(b.group, undefined, opts); const wa = performance.now() - t;
        out[name] = Object.assign(window.__aoCmp(a.group, b.group), { ms: [Math.round(js), Math.round(wa)] });
      }
      // GUN_ASYNC (the gun in the hands: worked out a few ms a frame), by the module and by the JavaScript, against GUN at once in JavaScript; the gun
      // moved and turned every few ms while it's worked out, as a drawn gun is, which mustn't change a number (the meshes' places are taken when it's asked)
      const ref = G.Models.assemble(def); G.GunAo.wasm.off = true; G.GunAo.apply(ref.group, undefined, G.GunAo.GUN);
      for (const [name, off] of [['GUN_ASYNC wasm', false], ['GUN_ASYNC js', true]]) {
        const c = G.Models.assemble(def), key = 'check:' + '${id}' + ':' + name + ':' + Math.random();
        G.GunAo.wasm.off = off; const t = performance.now(); G.GunAo.apply(c.group, key, G.GunAo.GUN_ASYNC); const first = performance.now() - t;
        const has = () => { let n = 0, w = 0; c.group.traverse((o) => { if (o.isMesh) { n++; if (o.geometry.attributes.aOcc) w++; } }); return w; };
        const atOnce = has();
        for (let k = 0; G.GunAo.busy && k < 5000; k++) { c.group.position.x += 0.01; c.group.rotation.y += 0.1; c.group.updateMatrixWorld(true); await new Promise((r) => setTimeout(r, 4)); }
        c.group.position.set(0, 0, 0); c.group.rotation.set(0, 0, 0); c.group.updateMatrixWorld(true);
        out[name] = Object.assign(window.__aoCmp(ref.group, c.group), { ms: [Math.round(first), Math.round(performance.now() - t)], withAoAtOnce: atOnce });
      }
      G.GunAo.wasm.off = false;
      return out;
    })()`, 120000);
    if (!r) { log('skip ' + id + ' (no build or model)'); continue; }
    for (const k of Object.keys(r)) report(id + ' ' + k + (/ASYNC/.test(k) ? ' (against GUN in js: vertices ' + r[k].verts.join(' / ') + ', ms in the call / till done ' + r[k].ms.join(' / ') + ')' : ' (js / wasm: vertices ' + r[k].verts.join(' / ') + ', ms ' + r[k].ms.join(' / ') + ')'), r[k]);
  }
  // the ship: layered (the breach door's leaves, the ramp), worked out at once here (async off), each from a ship of her own
  const s = await ev(`(async () => {
    const SD = G.SpaceData, d = SD.SHIPS.kestrel, f = SD.fleet0();
    const a = G.ShipModel.ship(d, f), b = G.ShipModel.ship(d, f);
    await new Promise((r) => setTimeout(r, 6000)); // (what ship() set going, across frames, is done: then it's done again here, by each path)
    const o = Object.assign({}, G.GunAo.SHIP, { async: false });
    G.GunAo.wasm.off = true; let t = performance.now(); G.GunAo.apply(a.group, undefined, o, [a.nose, [a.ramp]]); const js = performance.now() - t;
    G.GunAo.wasm.off = false; t = performance.now(); G.GunAo.apply(b.group, undefined, o, [b.nose, [b.ramp]]); const wa = performance.now() - t;
    return Object.assign(window.__aoCmp(a.group, b.group), { ms: [Math.round(js), Math.round(wa)], model: G.ShipModel.has(d.id) });
  })()`, 120000);
  report('ship kestrel SHIP layered (js / wasm: ms ' + s.ms.join(' / ') + ', baked model ' + s.model + ')', s);
  log(fails ? 'FAILED: ' + fails : 'all the same');
};
