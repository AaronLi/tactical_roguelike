'use strict';
// The furniture's meshes, on the page: js/furnspec.ts describes a level's furniture and its rooms' dressing as data, and
// this draws it, as three.js meshes. Everything static is merged into one mesh per finish (roughness, metalness,
// texture, glow), a piece's colour in its vertices: a houseful of furniture is a few dozen draw calls, not hundreds.
// The textures the description names are painted here, on canvases (js/furnspec.ts painters, from the state of the
// stream they were described at); so is the view out of a window (outsideMaterial) and the level's own use of the floor
// textures (textures: js/level.ts).
const G_FurnMesh = (() => {
  const S = G.FurnSpec;
  // a canvas painted, as a texture: the floors', rugs' and pictures' (repeating), the stock's labels, the window's view
  const canvas = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!, w, h); return c; };
  const mkTex: FdMk<THREE.CanvasTexture> = (w, h, draw) => { const tx = new THREE.CanvasTexture(canvas(w, h, draw)); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 4; return tx; };
  const mkView: FdMk<THREE.CanvasTexture> = (w, h, draw) => { const t = new THREE.CanvasTexture(canvas(w, h, draw)); t.colorSpace = THREE.NoColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  const mkPack: FdMk<THREE.CanvasTexture> = (w, h, draw) => { const t = new THREE.CanvasTexture(canvas(w, h, draw)); t.anisotropy = 4; return t; };
  let packTex: THREE.CanvasTexture | null = null;
  const packaging = () => packTex || (packTex = S.packPaint(mkPack)); // (made once, kept)
  // a geometry's UVs (0..1 a face) squeezed onto one label of the atlas (a little in from its edges: no neighbour bleeds in)
  function labelUV(geo: THREE.BufferGeometry, i: number) {
    const uv = geo.attributes.uv as THREE.BufferAttribute, n = S.PACK_N, u0 = (i % n) / n, v0 = 1 - (Math.floor(i / n) + 1) / n, s = (1 - 0.06) / n, o = 0.03 / n;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, u0 + o + uv.getX(j) * s, v0 + o + uv.getY(j) * s);
    return geo;
  }
  // the floor textures, painted from rnd (js/level.ts uses them too)
  const textures = (rnd: () => number) => S.painters(rnd, mkTex);

  // ---------------------------------------------------------------- the view out of a window
  // A night street behind the glass, faked in the shader. The view ray from the camera is traced from the
  // glass: first the ground outside (level with the floor), then a near layer 7 m out (trees, a fence,
  // streetlamps), then a city skyline and sky at infinity. Everything shifts with parallax as you move.
  function outsideMaterial(rnd: () => number, drop = 0) {
    // (its pictures sampled as written, sRGB, mixed with the colours below as they're written, and the result turned
    // linear at the end: js/util.ts)
    const [sky, near] = S.outsidePaint(rnd, mkView);
    return new THREE.ShaderMaterial({
      uniforms: { sky: { value: sky }, near: { value: near }, drop: { value: drop } },
      vertexShader: `
        varying vec3 vW; varying vec3 vN;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform sampler2D sky; uniform sampler2D near; uniform float drop;
        varying vec3 vW; varying vec3 vN;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        // a tower block across the road (high up): concrete, a grid of windows, some lit
        vec3 facade(vec3 h, vec3 r) {
          vec2 c = vec2(dot(h, r) / 2.6, h.y / 3.1), f = fract(c), id = floor(c);
          float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.78);
          float lit = step(0.62, hash(id)), warm = hash(id + 7.0);
          vec3 wall = vec3(0.035, 0.036, 0.04), dark = vec3(0.02, 0.028, 0.04);
          vec3 light = mix(vec3(1.0, 0.78, 0.5), vec3(0.7, 0.8, 1.0), step(0.8, warm)) * (0.45 + 0.3 * hash(id + 3.0));
          return mix(wall, mix(dark, light, lit), win);
        }
        vec3 ground(vec3 g, vec3 o, vec3 r, float t) {
          // dark grass and pavement, lit in pools under the streetlamps (every 12 m, 7 m out)
          float u = dot(g, r), s = dot(g - vW, o);
          float lu = (fract(u / 12.0 - 0.5) - 0.5) * 12.0;
          float pool = exp(-(lu * lu) / 10.0 - (s - 7.0) * (s - 7.0) / 6.0);
          vec3 c = vec3(0.018, 0.022, 0.02) + vec3(0.32, 0.22, 0.12) * pool;
          return mix(c, vec3(0.03, 0.035, 0.05), smoothstep(12.0, 70.0, t));
        }
        void main() {
          vec3 d = normalize(vW - cameraPosition), o = -vN, r = normalize(cross(vec3(0.0, 1.0, 0.0), o));
          float dn = max(dot(d, o), 0.02);
          float tN = 7.0 / dn;
          float tG = d.y < -0.001 ? (-drop - vW.y) / d.y : 1e9; // the ground: level with the floor, or far below
          vec3 col;
          if (drop > 0.5) { // high up: the tower across the road, else the street below, else the sky and skyline
            float tF = 38.0 / dn; vec3 hf = vW + d * tF;
            if (tF < tG && hf.y > -drop && hf.y < 4.0 + 6.0 * step(0.5, fract(dot(hf, r) / 60.0))) col = facade(hf, r); // (two blocks, one taller)
            else if (tG < 1e8) col = ground(vW + d * tG, o, r, tG) * 1.6;
            else col = texture2D(sky, vec2(atan(d.x, d.z) / 6.2831853 * 3.0, clamp(0.38 + asin(clamp(d.y, -1.0, 1.0)) / 1.4, 0.0, 0.999))).rgb;
          } else if (tG < tN) col = ground(vW + d * tG, o, r, tG);
          else {
            vec3 h = vW + d * tN;
            vec2 uv = vec2(dot(h, r) / 24.0, h.y / 8.0);
            vec4 nr = (uv.y >= 0.0 && uv.y <= 1.0) ? texture2D(near, uv) : vec4(0.0);
            vec3 far = d.y < -0.001 ? ground(vW + d * tG, o, r, tG)
              : texture2D(sky, vec2(atan(d.x, d.z) / 6.2831853 * 3.0, clamp(0.38 + asin(clamp(d.y, -1.0, 1.0)) / 1.4, 0.0, 0.999))).rgb;
            col = mix(far, nr.rgb, nr.a);
          }
          // a little sheen on the glass
          float fres = pow(1.0 - abs(dot(d, vN)), 3.0);
          gl_FragColor = linearToOutputTexel(vec4(pow(col * 0.9 + vec3(0.02, 0.025, 0.035) + fres * 0.06, vec3(2.2)), 1.0));
        }`,
    });
  }


  // ---------------------------------------------------------------- a description, drawn
  // A primitive's geometry, in its own frame, as three makes it
  function geometry(p: FdPrim): THREE.BufferGeometry {
    const T = THREE, s = p.s;
    let g: THREE.BufferGeometry;
    switch (p.t) {
      case 'box': g = new T.BoxGeometry(s[0], s[1], s[2]); break;
      case 'cyl': g = new T.CylinderGeometry(s[0], s[1], s[2], (p.seg as number) ?? 14); break;
      case 'sph': g = new T.SphereGeometry(s[0], 8, 6); break;
      case 'ico': g = new T.IcosahedronGeometry(s[0], 0); break;
      case 'side': { // a side profile ([z, y] points: along the piece and up) drawn across its width, its edges rounded by b
        const w = s[0], b = p.b || 0, sh = new T.Shape(p.pts!.map(([z, y]) => new T.Vector2(z, y)));
        g = new T.ExtrudeGeometry(sh, { depth: w - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 4 });
        g.translate(0, 0, -(w - 2 * b) / 2); g.rotateY(-Math.PI / 2);
        break;
      }
      case 'plane': {
        g = new T.PlaneGeometry(s[0], s[1]);
        if (p.uv) { const uv = g.attributes.uv as THREE.BufferAttribute; for (let k = 0; k < uv.count; k++) uv.setXY(k, p.uv[k * 2], p.uv[k * 2 + 1]); }
        break;
      }
      case 'grid': {
        const seg = p.seg as number[], pos = (g = new T.PlaneGeometry(s[0], s[1], seg[0], seg[1])).attributes.position as THREE.BufferAttribute;
        for (let k = 0; k < pos.count; k++) pos.setZ(k, p.z![k]);
        g.computeVertexNormals();
        break;
      }
      default: throw new Error('furniture: no primitive ' + (p as FdPrim).t);
    }
    return p.lb != null ? labelUV(g, p.lb) : g;
  }
  // Draw a description into root: each primitive placed in its group's frame, merged into one mesh per finish
  function realise(d: FdLevel, root: THREE.Object3D, crateTex: THREE.Texture) {
    const T = THREE;
    const texs: THREE.Texture[] = [];
    const texOf = (i: number) => {
      if (!texs[i]) {
        const td = d.tex[i];
        const t = td.k === 'crate' ? crateTex : td.k === 'pack' ? packaging() : (S.painters(S.srng(td.s!), mkTex) as any)[td.k](...(td.a || [])) as THREE.Texture;
        if (td.rep) t.repeat.set(td.rep[0], td.rep[1]);
        if (td.rot) t.rotation = td.rot;
        texs[i] = t;
      }
      return texs[i];
    };
    // a material: what it's drawn with is its finish's (shared by every colour of it), its colour goes in the vertices
    const finish = new Map<string, THREE.Material>(), bases: THREE.Material[] = [], cols: THREE.Color[] = [];
    const baseOf = (i: number) => {
      if (!bases[i]) {
        const m = d.mats[i], x = m.x, fk = m.r + '|' + m.m + (x ? JSON.stringify(Object.keys(x)) + '|' + (x.map != null ? x.map : '') + '|' + (x.emissive || '') : '');
        let b = finish.get(fk);
        if (!b) {
          const extra: Record<string, any> = {};
          if (x) for (const key of Object.keys(x)) extra[key] = key === 'map' ? texOf(x.map) : x[key];
          b = new T.MeshStandardMaterial(Object.assign({ color: 0xffffff, roughness: m.r, metalness: m.m, vertexColors: true }, extra));
          finish.set(fk, b);
        }
        bases[i] = b; cols[i] = new T.Color(m.c);
      }
      return bases[i];
    };
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const tmp = new T.Object3D(); tmp.rotation.order = 'YXZ'; // turn to face the room first, then tilt
    const up = new T.Vector3(0, 1, 0), one = new T.Vector3(1, 1, 1);
    for (const gr of d.groups) {
      const frame = gr.q != null ? new T.Matrix4().compose(new T.Vector3(gr.at[0], gr.at[1], gr.at[2]), new T.Quaternion().setFromAxisAngle(up, gr.q * Math.PI / 2), one) : new T.Matrix4().makeTranslation(gr.at[0], gr.at[1], gr.at[2]);
      for (const p of gr.prims) {
        const geo = geometry(p), b = baseOf(p.m);
        tmp.position.set(p.p[0], p.p[1], p.p[2]); tmp.rotation.set(p.r ? p.r[0] : 0, p.r ? p.r[1] : 0, 0); tmp.updateMatrix();
        const g2 = geo.index ? geo.toNonIndexed() : geo;
        g2.applyMatrix4(new T.Matrix4().multiplyMatrices(frame, tmp.matrix));
        g2.userData.col = cols[p.m]; // (its colour, for its vertices: the merge below)
        if (!byMat.has(b)) byMat.set(b, []);
        byMat.get(b)!.push(g2);
        if (g2 !== geo) geo.dispose();
      }
    }
    // merge
    for (const [m, geos] of byMat) {
      let n = 0; for (const g of geos) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = (m as THREE.MeshStandardMaterial).vertexColors ? new Float32Array(n * 3) : null;
      let o = 0;
      for (const g of geos) {
        const c = g.attributes.position.count;
        pos.set((g.attributes.position as THREE.BufferAttribute).array, o * 3); nor.set((g.attributes.normal as THREE.BufferAttribute).array, o * 3);
        if (g.attributes.uv) uv.set((g.attributes.uv as THREE.BufferAttribute).array, o * 2);
        if (col) { const k = g.userData.col; for (let i = o; i < o + c; i++) { col[i * 3] = k.r; col[i * 3 + 1] = k.g; col[i * 3 + 2] = k.b; } }
        o += c; g.dispose();
      }
      const bg = new T.BufferGeometry();
      bg.setAttribute('position', new T.BufferAttribute(pos, 3));
      bg.setAttribute('normal', new T.BufferAttribute(nor, 3));
      bg.setAttribute('uv', new T.BufferAttribute(uv, 2));
      if (col) bg.setAttribute('color', new T.BufferAttribute(col, 3));
      bg.computeBoundingSphere();
      root.add(new T.Mesh(bg, m));
    }
  }
  // A level's furniture and its rooms' floors, rugs, skirting and pictures, described (js/furnspec.ts) and drawn into root
  function build(map: any, root: THREE.Object3D, crateTex: THREE.Texture) {
    realise(S.describe(map), root, crateTex);
  }

  return { build, realise, geometry, textures, outsideMaterial, packaging };
})();
G.FurnMesh = G_FurnMesh;

interface GameModules { FurnMesh: typeof G_FurnMesh; }
