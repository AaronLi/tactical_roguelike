'use strict';
// Squad callsigns: each officer is an animal (snake, seal, frog, cat, raccoon, hyrax), with its emblem and its
// colour. The emblem goes on their left shoulder and, with their name, on a patch high on the back (js/rig.js);
// the menu, the lobby, the team list, the scoreboards and pings show it too. One of each animal to a squad: the
// host gives anyone whose pick is taken the first one free (G.Server 'hello').
G.Callsigns = (() => {
  const LIST = [
    { id: 'snake', name: 'Snake', color: 0xf2e94e },
    { id: 'seal', name: 'Seal', color: 0x3fa9f5 },
    { id: 'frog', name: 'Frog', color: 0x7bd34a },
    { id: 'cat', name: 'Cat', color: 0xf5a623 },
    { id: 'raccoon', name: 'Raccoon', color: 0xb9bec6 },
    { id: 'hyrax', name: 'Hyrax', color: 0xc8946a },
  ];
  const BY = Object.fromEntries(LIST.map((a) => [a.id, a]));
  const valid = (id) => !!BY[id];
  const of = (id) => BY[id] || LIST[0];
  const INK = '#15171a';

  // the emblem, drawn into a 64 x 64 box (scaled to s): the animal in col, its features in ink
  function draw(g, id, s, col) {
    g.save();
    g.scale(s / 64, s / 64);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const C = typeof col === 'number' ? G.U.hex(col) : col;
    const ell = (x, y, rx, ry, c) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = c; g.fill(); };
    const poly = (pts, c) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fillStyle = c; g.fill(); };
    const line = (pts, c, w) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.strokeStyle = c; g.lineWidth = w; g.stroke(); };
    switch (id) {
      case 'snake': { // coiled up, head raised, tongue out
        g.beginPath(); g.moveTo(10, 54); g.bezierCurveTo(2, 42, 22, 38, 34, 42); g.bezierCurveTo(48, 46, 58, 36, 50, 28); g.bezierCurveTo(44, 22, 30, 26, 28, 16);
        g.strokeStyle = C; g.lineWidth = 8; g.stroke();
        ell(29, 12, 9, 6.5, C);
        ell(31, 10, 1.8, 1.8, INK);
        line([20, 12, 13, 12], '#d8433a', 2); line([13, 12, 9, 9], '#d8433a', 1.8); line([13, 12, 9, 15], '#d8433a', 1.8);
        for (const [x, y] of [[14, 46], [26, 41], [40, 44], [52, 34], [40, 25]]) ell(x, y, 1.6, 1.6, INK); // markings
        break;
      }
      case 'seal': { // a round, earless head, big eyes, a whiskered muzzle
        ell(32, 34, 21, 20, C);
        ell(23, 29, 4.5, 5, INK); ell(41, 29, 4.5, 5, INK); ell(24.5, 27.5, 1.4, 1.4, '#fff'); ell(42.5, 27.5, 1.4, 1.4, '#fff');
        ell(27, 43, 6.5, 5, INK + '33'); ell(37, 43, 6.5, 5, INK + '33');
        ell(32, 38.5, 4, 2.8, INK);
        for (const [x, y] of [[25, 43], [28, 46], [36, 46], [39, 43]]) ell(x, y, 0.9, 0.9, INK);
        line([22, 44, 6, 41], C, 2); line([22, 47, 7, 50], C, 2); line([42, 44, 58, 41], C, 2); line([42, 47, 57, 50], C, 2);
        break;
      }
      case 'frog': { // eyes bulging on top of a wide head, a wide mouth
        ell(18, 20, 10, 10, C); ell(46, 20, 10, 10, C);
        ell(32, 38, 27, 17, C);
        ell(18, 20, 5, 5, INK); ell(46, 20, 5, 5, INK); ell(19.5, 18.5, 1.5, 1.5, '#fff'); ell(47.5, 18.5, 1.5, 1.5, '#fff');
        ell(28, 31, 1.4, 1.4, INK); ell(36, 31, 1.4, 1.4, INK);
        g.beginPath(); g.moveTo(12, 39); g.quadraticCurveTo(32, 52, 52, 39); g.strokeStyle = INK; g.lineWidth = 2.6; g.stroke();
        break;
      }
      case 'cat': { // pointed ears, slit eyes, whiskers
        poly([13, 28, 16, 5, 30, 19], C); poly([51, 28, 48, 5, 34, 19], C);
        poly([17, 22, 18, 12, 25, 19], INK + '55'); poly([47, 22, 46, 12, 39, 19], INK + '55');
        ell(32, 36, 20, 17, C);
        ell(24, 33, 3.2, 5, INK); ell(40, 33, 3.2, 5, INK); ell(24, 33, 1, 3.5, C); ell(40, 33, 1, 3.5, C);
        poly([28.5, 41, 35.5, 41, 32, 44.5], INK);
        line([32, 44.5, 32, 47, 28, 49], INK, 1.6); line([32, 47, 36, 49], INK, 1.6);
        line([20, 42, 4, 39], C, 2); line([20, 45, 5, 48], C, 2); line([44, 42, 60, 39], C, 2); line([44, 45, 59, 48], C, 2);
        break;
      }
      case 'raccoon': { // ears, the black mask across the eyes, a dark nose
        poly([11, 30, 15, 7, 29, 18], C); poly([53, 30, 49, 7, 35, 18], C);
        poly([16, 24, 17, 13, 24, 19], INK); poly([48, 24, 47, 13, 40, 19], INK);
        ell(32, 37, 23, 17, C);
        g.beginPath(); g.moveTo(10, 33); g.quadraticCurveTo(22, 24, 32, 32); g.quadraticCurveTo(42, 24, 54, 33); g.quadraticCurveTo(44, 44, 32, 38); g.quadraticCurveTo(20, 44, 10, 33); g.fillStyle = INK; g.fill();
        ell(23, 33, 2.6, 2.6, '#fff'); ell(41, 33, 2.6, 2.6, '#fff');
        ell(32, 45, 3.8, 3, INK);
        line([32, 48, 32, 50], INK, 1.6);
        break;
      }
      case 'hyrax': { // small round ears, a round face, a blunt snout
        ell(17, 19, 6.5, 6.5, C); ell(47, 19, 6.5, 6.5, C); ell(17, 19, 3, 3, INK + '55'); ell(47, 19, 3, 3, INK + '55');
        ell(32, 35, 20, 18, C);
        ell(32, 45, 10, 8, INK + '22');
        ell(24, 32, 2.8, 3, INK); ell(40, 32, 2.8, 3, INK); ell(25, 31, 0.9, 0.9, '#fff'); ell(41, 31, 0.9, 0.9, '#fff');
        ell(32, 42, 3.4, 2.4, INK);
        line([32, 44.5, 32, 47, 29, 49], INK, 1.5); line([32, 47, 35, 49], INK, 1.5);
        break;
      }
    }
    g.restore();
  }
  // the emblem as an image (for the page), in its own colour
  const urls = new Map();
  function url(id, px = 48) {
    const key = id + '|' + px;
    if (!urls.has(key)) {
      const c = document.createElement('canvas'); c.width = c.height = px;
      draw(c.getContext('2d'), of(id).id, px, of(id).color);
      urls.set(key, c.toDataURL());
    }
    return urls.get(key);
  }
  const html = (id, cls) => `<img class="anim${cls ? ' ' + cls : ''}" src="${url(id)}" alt="${of(id).name}" title="${of(id).name}">`;

  // the patches, as textures: on the shoulder (the emblem) and high on the back (the emblem and their name)
  const tex = new Map();
  function patchBase(c, g) {
    g.fillStyle = '#25282b'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#6a6e72'; g.setLineDash([5, 4]); g.lineWidth = 2; g.strokeRect(4, 4, c.width - 8, c.height - 8); g.setLineDash([]); // the stitching
  }
  function armTex(id) {
    const key = 'arm|' + id;
    if (!tex.has(key)) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      patchBase(c, g);
      g.translate(6, 6); draw(g, of(id).id, 52, of(id).color);
      const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
      tex.set(key, t);
    }
    return tex.get(key);
  }
  function backTex(id, name) {
    const label = String(name || '').toUpperCase().slice(0, 16), key = 'back|' + id + '|' + label;
    if (!tex.has(key)) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const g = c.getContext('2d');
      patchBase(c, g);
      g.save(); g.translate(8, 6); draw(g, of(id).id, 52, of(id).color); g.restore();
      let fs = 34;
      g.font = `bold ${fs}px Consolas, monospace`;
      while (g.measureText(label).width > 180 && fs > 14) g.font = `bold ${(fs -= 2)}px Consolas, monospace`;
      g.fillStyle = '#d9dcdf'; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText(label, 160, 34);
      const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
      tex.set(key, t);
    }
    return tex.get(key);
  }
  return { LIST, valid, of, draw, url, html, armTex, backTex };
})();
