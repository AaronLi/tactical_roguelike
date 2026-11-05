'use strict';
// The main menu's background: the guns, one after another, each alone against black while the camera runs a couple of
// the gear room's slow moves round it, slowed down further (js/highlights.ts tourMoves, tourPath: the same paths the highlight reel's tour
// uses), with a fade to black between guns. The gun sits to one side of the menu's box, the side alternating gun to gun. It takes over from
// the rotating level (js/game.ts menuBackdrop) once its first gun is in (the models arrive with the bundle: js/modelbundles.ts).
const G_MenuShow = (() => {
  const T = THREE;
  // the guns it shows (their factory builds), in a shuffled order, round and round
  const GUNS = ['m4', 'hk416', 'ak', 'scar', 'mk14', 'awm', 'r700', 'mp5', 'vector', 'aug', 'tavor', 'fal', 'tempest', 'm249', 'hailstorm', 'benelli', 'mcx', 'galil', 'svd', 'p90'];
  const SLOW = 1.8, MOVES = 2, FADE = 0.8, YAW = Math.PI / 2 + 0.45; // (SLOW: the moves this many times as long as in the reel)
  let S: any = null;

  function stage() {
    const scene = new T.Scene(); scene.background = new T.Color(0x000000); // (black: the gun alone, lit, nothing under it)
    scene.add(new T.HemisphereLight(0xdfe8ff, 0x1a1410, 1.1));
    const key = new T.DirectionalLight(0xffffff, 1.0); key.position.set(1, 2, 1.5); scene.add(key);
    const rim = new T.DirectionalLight(0xff9a40, 0.7); rim.position.set(-2, 1, -1.5); scene.add(rim);
    const pivot = new T.Group(); scene.add(pivot);
    const cam = new T.PerspectiveCamera(30, 16 / 9, 0.02, 50); scene.add(cam);
    // the fade: a black card just in front of the lens
    const veil = new T.Mesh(new T.PlaneGeometry(4, 4), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, depthTest: false, depthWrite: false }));
    veil.position.z = -0.05; veil.renderOrder = 999; cam.add(veil);
    const order = G.U.shuffle(Math.random, GUNS.filter((id) => G.WEAPONS[id]));
    S = { scene, pivot, cam, veil, order, n: 0, gun: null, pre: null, poses: null, moves: [], t: 0, dur: 0, side: 1, live: false };
  }
  // The gun after this one, loading while this one plays (its model asked for at once: its packs may take a moment), so the cut to it
  // comes right at the fade rather than after a stretch of black. { id, g, ready }
  function fetchNext() {
    for (let tries = 0; tries < S.order.length; tries++) {
      const id = S.order[S.n++ % S.order.length];
      let g: THREE.Group | null = null;
      try { g = G.GunModels.display(G.Gunsmith.compile(id, G.Gunsmith.defaultBuild(id))).group; } catch (e) { g = null; }
      if (!g) continue;
      const nx: any = { id, g, ready: !g.userData.pending, failed: false };
      if (!nx.ready) G.GunModels.whenReady(g, (ok: boolean) => { if (ok) nx.ready = true; else nx.failed = true; });
      S.pre = nx;
      return;
    }
  }
  // the next gun on: the one loaded ahead (when it's in), centred, its moves picked and posed; and the one after it asked for
  function next() {
    if (!S.pre || S.pre.failed) fetchNext();
    if (!S.pre || !S.pre.ready) return;
    const g: THREE.Group = S.pre.g; S.pre = null;
    while (S.pivot.children.length) S.pivot.remove(S.pivot.children[0]);
    S.pivot.rotation.y = 0; g.position.set(0, 0, 0); S.pivot.updateMatrixWorld(true);
    const b0 = new T.Box3().setFromObject(g); g.position.sub(b0.getCenter(new T.Vector3())); S.pivot.add(g);
    S.pivot.updateMatrixWorld(true);
    const b = new T.Box3().setFromObject(g);
    S.pivot.rotation.y = YAW; S.pivot.updateMatrixWorld(true);
    S.gun = g; S.side = -S.side;
    const slow = (G.Highlights.tourMoves as any[]).filter((m) => m.tempo === 'slow');
    S.moves = G.U.shuffle(Math.random, slow.slice()).slice(0, MOVES);
    S.poses = S.moves.map((m: any) => (m.keys || [m.a]).map((sh: any) => pose(b, sh)));
    S.dur = S.moves.reduce((a: number, m: any) => a + m.dur * SLOW, 0); S.t = 0; S.live = true;
    fetchNext();
  }
  // a shot (fractions of the gun's box, js/highlights.ts GearShot) in the world: the gun turned to YAW, the camera's side the near one
  function pose(b: THREE.Box3, sh: any) {
    const ry = new T.Matrix4().makeRotationY(YAW), sz = b.getSize(new T.Vector3()), gc = b.getCenter(new T.Vector3()), len = Math.max(sz.z, sz.y, 0.2);
    return { tw: new T.Vector3(gc.x, b.min.y + sz.y * sh.at[1], b.max.z - sz.z * sh.at[0]).applyMatrix4(ry),
      dir: new T.Vector3(sh.dir[2], sh.dir[1], -sh.dir[0]).normalize().applyMatrix4(ry), dist: sh.d * len, roll: sh.roll };
  }
  // each frame on the menu: the camera along this gun's moves (eased through each, one after the other), the fade in and out, then the next gun.
  // Returns whether it has a gun to show yet.
  function update(dt: number) {
    if (!S) stage();
    if (!S.live) { next(); return false; }
    S.t += dt;
    if (S.t >= S.dur) { S.veil.material.opacity = 1; next(); if (S.t >= S.dur) return true; }
    let t = S.t, i = 0;
    while (i < S.moves.length - 1 && t >= S.moves[i].dur * SLOW) { t -= S.moves[i].dur * SLOW; i++; }
    const p = G.U.clamp(t / (S.moves[i].dur * SLOW), 0, 1), k = 0.5 - 0.5 * Math.cos(Math.PI * p);
    const c = G.Highlights.tourPath(S.poses[i], k);
    S.cam.position.copy(c.pos); S.cam.lookAt(c.tw); S.cam.rotateZ(c.roll || 0);
    // black at the start and the end of each gun, and for a moment between its moves (a cut, softened)
    const edge = Math.min(S.t, S.dur - S.t), cut = i > 0 && t < 0.35 ? 1 - t / 0.35 : 0;
    S.veil.material.opacity = Math.max(1 - G.U.clamp(edge / FADE, 0, 1), cut * 0.85);
    return true;
  }
  // drawn instead of the level (js/game.ts loop): the gun to the side of the menu's box, the other side each gun
  function render(r: THREE.WebGLRenderer) {
    const W = window.innerWidth, H = window.innerHeight;
    S.cam.aspect = W / H; S.cam.setViewOffset(W, H, S.side * W * 0.27, -H * 0.02, W, H); S.cam.updateProjectionMatrix();
    r.render(S.scene, S.cam);
  }
  return { update, render, get live() { return !!(S && S.live); } };
})();
G.MenuShow = G_MenuShow;

interface GameModules { MenuShow: typeof G_MenuShow; }
