# The shared builder of the TUBE red dots (models/parts/optic/<id>/build_<id>.py set CFG and exec this): the remaster of the recipe's
# S.reddot (tools/models/recipes.ts), same sizes so every sight line and magnifier pairing stays as it is: a tube of outer radius R and
# length L centred on the mount point, its axis sy = 14 mm + R over the rail, a reflex window (the front lens) 1.3 mm inside the tube's skin (thin walls).
# Frame (docs/models.md "Authored parts"): Blender X = right, Y = forward, Z = up, metres; ORIGIN = the rail's top at the mount point, centred.
# CFG: R, L, replaces, ret (the reticle: dot, dotG, cdot), and the family's look:
#   mount 'qd' (a QD riser: a clamp base with a throw lever, a neck up to the tube) or 'low' (a low integral clamp under a square centre block);
#   block: a square centre housing round the tube (the micro dots: the turrets and the dial in it);
#   ring: the rubber armour band; sunshade: a shade forward of the front ring (m); facets: the tube's front bell is 8-sided; solar: a panel on top;
import bpy, json, math, os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
exec(open(os.path.join(REPO, 'models', 'blender_kit.py')).read(), globals())
ID = os.path.basename(HERE)
C = globals()['CFG']
EXPORT = os.environ.get('PART_EXPORT', '1') == '1'
_bevel = bevel
def bevel(o, w, seg=2, angle=40): return _bevel(o, w, 1, angle)          # (the triangle budget: one-segment bevels)
coll, root = kit_collection(ID)
K = Kit(coll, root)
R, L = C['R'], C['L']
SY = 0.014 + R                       # the sight line
F0, F1 = -L / 2, L / 2               # the tube's rear and front
RIN = R - 1.3 * mm                   # the bore (the lenses): a thin wall, as little frame in the picture as can be
SEG = 24 if R < 0.022 else 28

# ---- the tube: rings at both ends (a bevelled lip), a slimmer body between; the bore through it (dark inside: tubeDS) ----
RB = R - 0.8 * mm                    # the body between the rings
prof = [(F0, R - 0.9 * mm), (F0 + 1.0 * mm, R), (F0 + 5 * mm, R), (F0 + 6 * mm, RB), (F1 - 6 * mm, RB), (F1 - 5 * mm, R), (F1 - 1.0 * mm, R), (F1, R - 0.9 * mm)]
tb = K.tmp(lathe(prof, SEG, (0, 0, SY)))
if C.get('facets'):
    fb = lathe([(F1 - 14 * mm, RB), (F1 - 12 * mm, R + 1.0 * mm), (F1 - 0.8 * mm, R + 1.0 * mm), (F1, R + 0.2 * mm)], 8, (0, 0, SY))
    fb.transform(Matrix.Translation((0, 0, SY)) @ Matrix.Rotation(math.pi / 8, 4, 'Y') @ Matrix.Translation((0, 0, -SY)))
    boolean(tb, fb, 'UNION')
cut(tb, cyl(RIN, F0 - 0.01, F1 + 0.01, 'y', (0, SY), SEG))
smooth(tb); K.adopt(tb, 'optic', 'tubeDS')
if C.get('sunshade'):
    S_ = C['sunshade']
    o = K.tmp(lathe([(F1 - 1 * mm, R - 0.3 * mm), (F1 + S_, R - 0.3 * mm), (F1 + S_, R - 1.1 * mm), (F1 - 1 * mm, R - 1.1 * mm)], SEG, (0, 0, SY)))
    cut(o, cyl(R - 1.1 * mm, F1 - 0.01, F1 + S_ + 0.01, 'y', (0, SY), SEG)); smooth(o); K.adopt(o, 'optic', 'tubeDS')
if C.get('ring'):     # the rubber armour band round the body
    o = K.tmp(lathe([(F0 + 8 * mm, RB + 0.9 * mm), (F1 - 8 * mm, RB + 0.9 * mm)], SEG, (0, 0, SY)))
    cut(o, cyl(RB - 0.2 * mm, F0, F1, 'y', (0, SY), SEG))
    for k in range(3):     # three grip grooves, 0.5 mm deep
        f = F0 + 8 * mm + (k + 1) * (L - 16 * mm) / 4 - 0.5 * mm
        g = K.tmp(lathe([(f, RB + 3 * mm), (f + 1.0 * mm, RB + 3 * mm)], SEG, (0, 0, SY))); cut(g, cyl(RB + 0.4 * mm, f - 0.001, f + 0.002, 'y', (0, SY), SEG))
        cut(o, g.data.copy()); bpy.data.objects.remove(g, do_unlink=True)
    smooth(o); K.adopt(o, 'optic', 'rubber')
# the lenses: the rear (clear) and the front (the reflex mirror, the window)
o = K.obj(cyl(RIN + 0.05 * mm, F0 + 3.25 * mm, F0 + 4.75 * mm, 'y', (0, SY), SEG), 'optic', 'clearLens'); smooth(o)
WF = F1 - 6 * mm
o = K.obj(cyl(RIN + 0.05 * mm, WF - 0.75 * mm, WF + 0.75 * mm, 'y', (0, SY), SEG), 'optic', 'reflexLens'); smooth(o)

# ---- the centre block (the micro dots), or the turrets straight on the tube ----
TF = C.get('turret_f', 0.004)
if C.get('block'):
    BH = R + 0.6 * mm                                            # its half width / height round the axis: shaved to just past the tube's skin,
    bk = K.tmp(prism(rounded(0, SY, BH, BH, BH * 0.62, 4), 'y', TF - 7 * mm, TF + 7 * mm))   # its corners rounded nearly to the tube (it barely shows round it)
    cut(bk, cyl(RIN, -0.05, 0.05, 'y', (0, SY), SEG)); bevel(bk, 0.8 * mm, 1, 30); smooth(bk); K.adopt(bk, 'optic', 'black')
    TOP, RT = SY + BH, BH
else:
    TOP, RT = SY + RB, RB
# elevation (top) and windage (right): a capped turret; the brightness dial on the left (ribbed) or, with 'buttons', two rear buttons
def turret(r, h, at, rot):
    # its foot reaches down to where the tube's skin is lowest under it, then the bore is cut out of it: it saddles the tube, nothing inside
    t = K.tmp(lathe([(-2.5 * mm, r), (h - 1 * mm, r), (h, r - 1 * mm), (h, 0.0005)], 14))
    t.data.transform(Matrix.Translation(at) @ rot)
    cut(t, cyl(RIN + 0.25 * mm, F0 - 0.01, F1 + 0.01, 'y', (0, SY), SEG)); smooth(t); K.adopt(t, 'optic', 'black')
TR = C.get('turret_r', 6.0 * mm)
turret(TR + 1.2 * mm, 3.0 * mm, (0, TF, TOP - 1.0 * mm), Matrix.Rotation(math.pi / 2, 4, 'X'))      # the boss
turret(TR, 7.0 * mm, (0, TF, TOP - 1.0 * mm), Matrix.Rotation(math.pi / 2, 4, 'X'))                 # the cap
turret(TR + 1.2 * mm, 3.0 * mm, (RT - 1.0 * mm, TF, SY), Matrix.Rotation(-math.pi / 2, 4, 'Z'))
turret(TR, 7.0 * mm, (RT - 1.0 * mm, TF, SY), Matrix.Rotation(-math.pi / 2, 4, 'Z'))
if C.get('guards'):   # turret guards: two ears either side of the elevation cap (the micro dots)
    for s in (-1, 1):
        o = K.tmp(prism([(TF - 6 * mm, TOP - 1 * mm), (TF + 6 * mm, TOP - 1 * mm), (TF + 4.5 * mm, TOP + 4.8 * mm), (TF - 4.5 * mm, TOP + 4.8 * mm)], 'x', s * (TR + 1.6 * mm), s * (TR + 3.6 * mm)))
        bevel(o, 0.7 * mm, 1, 30); smooth(o); K.adopt(o, 'optic', 'black')
DR = C.get('dial_r', 7.0 * mm)
dl = K.tmp(lathe([(-2.5 * mm, DR), (5.5 * mm, DR), (6.0 * mm, DR - 0.8 * mm), (6.0 * mm, 0.0005)], 16))
for i in range(8):
    g = box(-0.5 * mm, 0.5 * mm, 0.001, 0.007, DR - 0.6 * mm, DR + 1 * mm); g.transform(Matrix.Rotation(i * math.pi / 4, 4, 'Y')); cut(dl, g)
dl.data.transform(Matrix.Translation((-RT + 1.0 * mm, TF - C.get('dial_df', 0.0), SY)) @ Matrix.Rotation(math.pi / 2, 4, 'Z'))
cut(dl, cyl(RIN + 0.25 * mm, F0 - 0.01, F1 + 0.01, 'y', (0, SY), SEG)); smooth(dl); K.adopt(dl, 'optic', 'black')
if C.get('solar'):    # a solar panel on a flat pad on top, behind the elevation turret
    o = K.tmp(box(-RB + 3.5 * mm, RB - 3.5 * mm, F0 + 7 * mm, TF - TR - 2.5 * mm, TOP - 1.5 * mm, TOP + 1.2 * mm)); bevel(o, 0.6 * mm, 1, 30); smooth(o); K.adopt(o, 'optic', 'black')
    o = K.obj(box(-RB + 4.5 * mm, RB - 4.5 * mm, F0 + 8 * mm, TF - TR - 3.5 * mm, TOP + 1.2 * mm, TOP + 1.5 * mm), 'optic', 'glass')

# ---- the mount ----
BL = C.get('base_len', min(L - 6 * mm, 0.046))
if C.get('mount', 'qd') == 'low':     # a low integral clamp right under the tube (the micro dots on their tall riser are QD)
    BT = SY - RB + 1.0 * mm
else:
    BT = 0.011
b = K.tmp(prism([(-0.015, 0.0), (0.015, 0.0), (0.0155, 0.004), (0.012, BT), (-0.012, BT), (-0.0155, 0.004)], 'y', TF - BL / 2, TF + BL / 2))
cut(b, box(-0.0108, 0.0108, -0.1, 0.1, -0.001, 0.0015))                                   # (the rail's top in its channel)
if BT > 0.016: cut(b, prism(rounded(TF, (0.004 + BT) / 2 + 0.001, BL / 2 - 7 * mm, (BT - 0.004) / 2 - 2.5 * mm, 1.5 * mm, 2), 'x', -0.03, 0.03))   # a lightening window (a tall riser)
bevel(b, 0.8 * mm, 1, 30); smooth(b); K.adopt(b, 'optic', 'black')
nk = K.tmp(prism([(-0.010, BT - 0.001), (0.010, BT - 0.001), (0.0075, SY - RB + 1.5 * mm), (-0.0075, SY - RB + 1.5 * mm)], 'y', TF - BL / 2 + 0.004, TF + BL / 2 - 0.004))
bevel(nk, 1 * mm, 1, 30); smooth(nk); K.adopt(nk, 'optic', 'black')
if C.get('mount', 'qd') == 'qd':   # the QD throw lever (right), its cross-bolt nut (left)
    lv = K.tmp(prism([(TF - 0.012, 0.002), (TF + 0.012, 0.002), (TF + 0.014, 0.007), (TF - 0.008, 0.008)], 'x', 0.0155, 0.0185)); bevel(lv, 0.6 * mm, 1, 30); smooth(lv); K.adopt(lv, 'optic', 'black')
    o = K.obj(cyl(2.4 * mm, 0.0155, 0.0175, 'x', (TF, 0.005), 12), 'optic', 'steel'); smooth(o)
else:
    for s in (-1, 1): o = K.obj(cyl(2.6 * mm, s * 0.0152, s * 0.0168, 'x', (TF, 0.005), 6 if s < 0 else 12), 'optic', 'steel'); smooth(o)
# ---- model.json: sight line, the eye end, the reflex window (round: the bore), magnifier-ready; what it replaces ----
cfg = {'source': 'authored', 'kind': 'part', 'slot': 'optic', 'frame': 'rail-top',
       'optic': {'sy': round(SY, 4), 'fSight': round(F0, 4), 'relief': C.get('relief', 0.085),
                 'reflex': {'f': round(WF, 4), 'y': round(SY, 4), 'w': round(2 * RIN, 4), 'h': round(2 * RIN, 4), 'round': True, 'kind': C.get('ret', 'dot')},
                 'magnifier': True, 'height': 'low' if SY < 0.03 else 'mid'},
       'replaces': C['replaces']}
if EXPORT:
    with open(os.path.join(HERE, 'model.json'), 'w', encoding='utf-8') as fh: fh.write(json.dumps(cfg, indent=2, ensure_ascii=False) + '\n')
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
print('RESULT', json.dumps(result))
