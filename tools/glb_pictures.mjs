// Every picture in a baked .glb, on one sheet (a PNG): to look over what a bake drew (the hangar's signs: tools/bake_hangar.mjs).
//   node tools/glb_pictures.mjs assets/models/scenes/hangar.glb sheet.png
import fs from 'fs'; import { makeIO } from './model_emit.mjs'; import { nodeCanvas } from './node_canvas.mjs';
const [file, out] = process.argv.slice(2);
const io = await makeIO(), doc = await io.read(file), NC = await nodeCanvas(), tx = doc.getRoot().listTextures();
const C = 9, W = 240, H = 150, cv = NC.createCanvas(C * (W + 4), Math.ceil(tx.length / C) * (H + 4)), g = cv.getContext('2d'); g.fillStyle = '#404040'; g.fillRect(0, 0, cv.width, cv.height);
tx.forEach((t, i) => { const im = NC.CK.MakeImageFromEncoded(t.getImage()); if (!im) return; const k = Math.min(W / im.width(), H / im.height()), w = im.width() * k, h = im.height() * k, x = (i % C) * (W + 4) + (W - w) / 2, y = Math.floor(i / C) * (H + 4) + (H - h) / 2; g.save(); g.translate(x, y + h); g.scale(1, -1); g.drawImage(im, 0, 0, w, h); g.restore(); });
fs.writeFileSync(out, cv.png()); console.log(tx.length + ' pictures -> ' + out);
