# The shared builder of the PISTOL dots (models/parts/optic/<id>/build_<id>.py set CFG and exec this): the Ember's frame and sizes
# (models/parts/optic/ember), so every one fits every slide cut and riser the recipe's S.minidot fits: footprint 24 x 32 mm centred on the
# mount point, sight line 16 mm over the mount surface, the window 20 x 16 mm on it, nothing over 27 mm.
# Frame (docs/models.md "Authored parts"): Blender X = right, Y = forward, Z = up, metres; ORIGIN = the mount surface at the mount point,
# centred. Nothing below Z = 0. (Drawn from the footprint's front edge at forward 0, moved forward 16 mm at the end, as the Ember.)
# CFG: replaces, ret (dot, dotG, cdot), hood:
#   'rmr'    a loop round the lens with sloped shoulders, leaning back (the Ember's family);
#   'shroud' straight thick walls, square shoulders and a flat top, upright (a duty sight);
#   'arch'   a low, round-topped hood leaning well back out of a low housing (a slim carry sight);
#   'closed' an enclosed box: the window a tunnel through it, glass at both ends (a duty enclosed sight);
#   solar: a solar panel on the housing's top; tray: a side battery tray on the right.
import bpy, json, math, os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
exec(open(os.path.join(REPO, 'models', 'blender_kit.py')).read(), globals())
ID = os.path.basename(HERE)
C = globals()['CFG']
EXPORT = os.environ.get('PART_EXPORT', '1') == '1'
coll, root = kit_collection(ID)
K = Kit(coll, root)
HOOD = C.get('hood', 'rmr')
W = 12 * mm
R0, F0 = -32 * mm, 0.0
SY = 16 * mm
WIN_W, WIN_H = 20 * mm, 16 * mm
LEDGE = 5.0 * mm if HOOD != 'arch' else 4.0 * mm
HT = {'rmr': 7.8 * mm, 'shroud': 9.0 * mm, 'arch': 6.4 * mm, 'closed': 7.8 * mm}[HOOD]   # the emitter housing's top (under the window's clear opening)
HF = -21 * mm if HOOD != 'arch' else -23 * mm
TOP = {'rmr': 26 * mm, 'shroud': 26 * mm, 'arch': 25.0 * mm, 'closed': 26.5 * mm}[HOOD]   # (the hood's top: 2 mm or less over the window)

if HOOD == 'closed':
    # ---- an enclosed box: one body, its corners rounded, the window a tunnel through it; the base a little wider at the foot ----
    bx = K.tmp(prism(rounded(0, TOP / 2, W, TOP / 2, 3.0 * mm, 3), 'y', R0, F0))
    cut(bx, box(-W - 1 * mm, W + 1 * mm, R0 - 1 * mm, F0 + 1 * mm, -1 * mm, 0.0))
    cut(bx, prism(rounded(0, SY, WIN_W / 2, WIN_H / 2, 2.0 * mm, 3), 'y', R0 + 2.0 * mm, F0 + 1 * mm))     # the tunnel, its rear end a lip
    cut(bx, prism(rounded(0, SY, WIN_W / 2 - 1.2 * mm, WIN_H / 2 - 1.0 * mm, 1.6 * mm, 3), 'y', R0 - 1 * mm, R0 + 2.5 * mm))
    cut(bx, box(-W - 1 * mm, W + 1 * mm, R0 + 7 * mm, F0 - 6 * mm, TOP - 0.8 * mm, TOP + 1 * mm))           # a flat on the top (the elevation screw)
    for s in (-1, 1): cut(bx, box(s * (W - 0.6 * mm), s * (W + 1 * mm), R0 + 4 * mm, F0 - 4 * mm, 4.5 * mm, TOP - 4 * mm) if s > 0 else box(-W - 1 * mm, -W + 0.6 * mm, R0 + 4 * mm, F0 - 4 * mm, 4.5 * mm, TOP - 4 * mm))
    bevel(bx, 0.6 * mm, 1); smooth(bx); K.adopt(bx, 'optic', 'black')
    o = K.obj(box(-WIN_W / 2 + 0.2 * mm, WIN_W / 2 - 0.2 * mm, R0 + 2.2 * mm, R0 + 3.2 * mm, SY - WIN_H / 2 + 0.2 * mm, SY + WIN_H / 2 - 0.2 * mm), 'optic', 'clearLens')
    LFW = F0 - 3.0 * mm                                       # the front glass (the window)
    o = K.obj(box(-WIN_W / 2 + 0.2 * mm, WIN_W / 2 - 0.2 * mm, LFW - 0.6 * mm, LFW + 0.6 * mm, SY - WIN_H / 2 + 0.2 * mm, SY + WIN_H / 2 - 0.2 * mm), 'optic', 'reflexLens')
    EMU = SY - WIN_H / 2 + 1.2 * mm
    o = K.obj(cyl(0.8 * mm, R0 + 9 * mm, R0 + 10 * mm, 'y', (0, EMU), 12), 'optic', 'glass'); smooth(o)
    AF, WF, WU = R0 + 12 * mm, R0 + 12 * mm, 9.0 * mm
    el = K.obj(cyl(2.2 * mm, TOP - 1.4 * mm, TOP - 0.55 * mm, 'z', (0, AF), 20), 'optic', 'steel'); smooth(el)
    cut(el, box(-2.8 * mm, 2.8 * mm, AF - 0.35 * mm, AF + 0.35 * mm, TOP - 1.0 * mm, TOP))
    wd = K.obj(cyl(1.6 * mm, W - 1.0 * mm, W - 0.4 * mm, 'x', (WF, WU), 20), 'optic', 'steel'); smooth(wd)
    for s in (-1, 1):
        b = K.tmp(prism(rounded(R0 + 20 * mm, 9.0 * mm, 2.4 * mm, 1.6 * mm, 0.8 * mm, 3), 'x', s * (W - 1.0 * mm), s * (W - 0.1 * mm))); smooth(b); K.adopt(b, 'optic', 'rubber')
    FS = R0 + 2.0 * mm                                        # the eye end
else:
    # ---- base + emitter housing: one side profile (forward, up) across the full width ----
    prof = [(R0, 0), (F0, 0), (F0, 3.2 * mm), (F0 - 1.2 * mm, LEDGE - 0.6 * mm), (F0 - 2.5 * mm, LEDGE),
            (HF + 1.2 * mm, LEDGE), (HF, LEDGE + 0.8 * mm), (HF - 0.8 * mm, HT), (R0 + 3.5 * mm, HT), (R0 + 0.8 * mm, HT - 1.6 * mm), (R0, HT - 2.4 * mm)]
    body = K.tmp(prism(prof, 'x', -W, W))
    cut(body, box(-W - 1 * mm, -W + 0.8 * mm, R0 - 1 * mm, HF + 0.3 * mm, 3.6 * mm, HT + 1 * mm))
    cut(body, box(W - 0.8 * mm, W + 1 * mm, R0 - 1 * mm, HF + 0.3 * mm, 3.6 * mm, HT + 1 * mm))
    cut(body, box(-1.2 * mm, 1.2 * mm, R0 - 1 * mm, R0 + 4.5 * mm, HT - 1.0 * mm, HT + 1 * mm))          # the rear notch
    EMU = LEDGE + 1.5 * mm
    cut(body, cyl(1.2 * mm, HF - 1.2 * mm, HF + 0.8 * mm, 'y', (0, EMU), 16))
    bevel(body, 0.6 * mm, 1); smooth(body); K.adopt(body, 'optic', 'black')
    o = K.obj(cyl(0.8 * mm, HF - 0.9 * mm, HF - 0.5 * mm, 'y', (0, EMU), 12), 'optic', 'glass'); smooth(o)
    # ---- the hood ----
    hb = LEDGE - 0.5 * mm
    if HOOD == 'shroud':
        HD, LEAN_F, LEAN_R, LEAN = 10 * mm, math.radians(4), math.radians(0), math.radians(8)
        outer = rounded(0, (hb + TOP) / 2, W, (TOP - hb) / 2, 2.0 * mm, 3)
    elif HOOD == 'arch':
        HD, LEAN_F, LEAN_R, LEAN = 8 * mm, math.radians(28), math.radians(16), math.radians(20)
        TR = 8.5 * mm
        outer = [(-W, hb), (W, hb), (W, TOP - TR)] + [(W - TR + TR * math.cos(math.radians(90 * j / 6)), TOP - TR + TR * math.sin(math.radians(90 * j / 6))) for j in range(7)] + \
                [(-W + TR - TR * math.sin(math.radians(90 * j / 6)), TOP - TR + TR * math.cos(math.radians(90 * j / 6))) for j in range(7)]
    else:  # rmr
        HD, LEAN_F, LEAN_R, LEAN = 9 * mm, math.radians(18), math.radians(6), math.radians(12)
        TR, TC = 2.4 * mm, TOP - 2.4 * mm
        arc = lambda cx, a0, a1: [(cx + TR * math.cos(math.radians(a0 + (a1 - a0) * j / 4)), TC + TR * math.sin(math.radians(a0 + (a1 - a0) * j / 4))) for j in range(5)]
        outer = [(-W, hb), (W, hb), (W, 18.5 * mm), (10.9 * mm, 23.2 * mm)] + arc(10.5 * mm - TR, 0, 90) + arc(-10.5 * mm + TR, 90, 180) + [(-10.9 * mm, 23.2 * mm), (-W, 18.5 * mm)]
    hood = K.tmp(prism(outer, 'y', -HD, 0.0))
    cut(hood, prism(rounded(0, SY, WIN_W / 2, WIN_H / 2, 1.6 * mm if HOOD != 'arch' else 4.0 * mm, 4), 'y', -HD - 1 * mm, 1 * mm))
    hood.data.transform(Matrix.Translation((0, -1.2 * mm, 0)))
    for v in hood.data.vertices:
        v.co.y -= max(0.0, v.co.z - LEDGE) * math.tan(LEAN_F if v.co.y > -1.2 * mm - HD / 2 else LEAN_R)
    bevel(hood, 0.5 * mm, 2); smooth(hood); K.adopt(hood, 'optic', 'black')
    # the lens, leaning with the hood, in the middle of its depth
    LF = -1.2 * mm - HD / 2 + (SY - LEDGE) * math.tan(LEAN)
    WR = 1.6 * mm if HOOD != 'arch' else 4.0 * mm             # (the window's corner radius: the lens follows it, 0.4 mm into the hood)
    lens = K.obj(prism(rounded(0, SY, WIN_W / 2 + 0.4 * mm, WIN_H / 2 + 0.4 * mm, WR + 0.4 * mm, 4), 'y', LF - 0.6 * mm, LF + 0.6 * mm), 'optic', 'reflexLens')
    for v in lens.data.vertices: v.co.y -= max(0.0, v.co.z - LEDGE) * math.tan(LEAN)
    LFW = LF - (SY - LEDGE) * math.tan(LEAN)                  # the lens's forward position at the sight line (the window)
    # the adjusters: elevation on the housing's top, windage on its right side
    AF, WF, WU = -26.5 * mm, -29.0 * mm, min(5.9 * mm, HT - 1.8 * mm)
    el = K.obj(cyl(2.2 * mm, HT - 0.9 * mm, HT + 0.25 * mm, 'z', (0, AF), 20), 'optic', 'steel')
    cut(el, box(-2.8 * mm, 2.8 * mm, AF - 0.35 * mm, AF + 0.35 * mm, HT - 0.3 * mm, HT + 1 * mm)); smooth(el)
    wd = K.obj(cyl(1.6 * mm, W - 1.6 * mm, W - 0.3 * mm, 'x', (WF, WU), 20), 'optic', 'steel')
    cut(wd, box(W - 0.6 * mm, W, WF - 2.0 * mm, WF + 2.0 * mm, WU - 0.3 * mm, WU + 0.3 * mm)); smooth(wd)
    for s in (-1, 1):
        b = K.tmp(prism(rounded(-24.0 * mm, WU, 1.7 * mm, 1.3 * mm, 0.8 * mm, 3), 'x', s * (W - 1.2 * mm), s * (W - 0.15 * mm))); smooth(b); K.adopt(b, 'optic', 'rubber')
    for s in (-1, 1):   # the mounting screws on the ledge
        sc = K.obj(cyl(1.5 * mm, LEDGE - 0.3 * mm, LEDGE + 0.5 * mm, 'z', (s * 6.5 * mm, -14.5 * mm), 14), 'optic', 'steel')
        cut(sc, cyl(0.55 * mm, LEDGE + 0.1 * mm, LEDGE + 1 * mm, 'z', (s * 6.5 * mm, -14.5 * mm), 6)); smooth(sc)
    if C.get('solar'):   # a solar panel let into the housing's top, ahead of the elevation screw
        o = K.obj(box(-W + 2.2 * mm, W - 2.2 * mm, AF + 3.0 * mm, HF - 1.2 * mm, HT - 0.2 * mm, HT + 0.15 * mm), 'optic', 'glass')
    FS = R0
if C.get('tray'):   # a side battery tray on the right, two screws
    o = K.tmp(box(W - 0.2 * mm, W + 1.4 * mm, R0 + 3 * mm, R0 + 17 * mm, 1.0 * mm, min(HT, 9 * mm) - 0.8 * mm)); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'optic', 'black')
    for f in (R0 + 5.5 * mm, R0 + 14.5 * mm): o = K.obj(cyl(0.9 * mm, W + 1.3 * mm, W + 1.7 * mm, 'x', (f, 3.0 * mm), 10), 'optic', 'steel'); smooth(o)

# ---- the mount point is the footprint's middle ----
for o in root.children: o.data.transform(Matrix.Translation((0, 16 * mm, 0)))
cfg = {'source': 'authored', 'kind': 'part', 'slot': 'optic', 'frame': 'rail-top',
       'optic': {'sy': SY, 'fSight': round(FS + 16 * mm, 4), 'relief': 0.3, 'reliefOnRiser': 0.12,
                 'reflex': {'f': round(LFW + 16 * mm, 4), 'y': SY, 'w': WIN_W, 'h': WIN_H, 'kind': C.get('ret', 'dot')},
                 'magnifier': True, 'height': 'low'},
       'replaces': C['replaces']}
if EXPORT:
    with open(os.path.join(HERE, 'model.json'), 'w', encoding='utf-8') as fh: fh.write(json.dumps(cfg, indent=2, ensure_ascii=False) + '\n')
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
print('RESULT', json.dumps(result))
