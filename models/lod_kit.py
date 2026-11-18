# Levels of detail for the authored (Blender) gun models and parts: each source .glb simplified for a set of viewing distances.
#
#   blender -b -P models/lod_kit.py                        every authored gun and part (models/<id>/, models/parts/<slot>/<id>/: a folder with a model.json)
#   blender -b -P models/lod_kit.py -- m4 sr25             these guns (their variant files, barrel_*.glb and so on, too)
#   blender -b -P models/lod_kit.py -- parts/stock/kestrel_cs4 models/tempest/muzzle_comp.glb
#   ... -- m4 --dist 1.5,6,20,60 --px 0.5 --fov 75 --height 1080 --force
#
# Level 0 is the source itself (the first-person gun, the gunsmith). Level 1 is the third-person model (a gun in someone else's hands, on the
# floor, on the hangar's wall), and each level after it is for further away. A level is DEFINED BY THE DISTANCE IT IS FIRST USED AT (--dist,
# metres): its tolerance is how big --px of a pixel is at that distance (a --fov degree vertical view --height pixels tall: 1.42 mm a pixel
# per metre for the game's 75 degrees at 1080), and the level is the fewest triangles whose surface stays within that tolerance of the
# source's, both ways. So the switch can't be seen by its shape, and a runtime picks the level by `from` in lods.json (a scope's
# magnification divides the distance: a 4x scope at 20 m needs the 5 m level).
#
# What a level does to each mesh (one mesh of the source = one mesh of the level, same node, same name, same extras, same material):
#   - a mesh smaller than a pixel there (its box's diagonal under tolerance / px) is left out, unless its node carries extras other than
#     `slot` (a `chk` round, a `mount` piece...: something reads those) or its material is a lens;
#   - a lens (glass, reflexLens) and a mesh of 12 triangles or fewer are kept as they are;
#   - the rest is edge-collapsed (Blender's Decimate) as far as it goes with every point of the source within the tolerance of the result
#     and every point of the result within it of the source (the vertices and a grid over every triangle, both ways), facing the same way
#     (a box may not become a sheet), and with no edge left open that the source had closed; found by bisection on the ratio;
#     the tolerance is never more than 12 % of the mesh's own size, so a part that is still drawn keeps its shape;
#   - from level 2 its convex hull is tried the same way (a small or far-off part: a closed stand-in) and taken if it comes to fewer triangles;
#   - flat faces stay flat and round ones smooth: sharp where two faces meet at more than 30 degrees.
# Empties (the root with info_json / anchors_json, part_<key> pivots) are untouched: a level seats and animates exactly as the source.
#
# Output, beside each source: lod/<name>.lod<N>.glb and lod/lods.json ({ params, levels: [{ lod, from, tol }], files: { "<name>.glb":
# { src, tris, levels: [{ lod, file, tris, meshes, dropped, err }] } } }). A file whose source and parameters are unchanged is skipped
# (--force redoes it). The folder is `lod/` because the bake takes every .glb directly in a gun's folder for a variant (tools/bake_authored.mjs).
import bpy, bmesh, json, hashlib, math, os, struct, sys, time
from mathutils import Vector
from mathutils.bvhtree import BVHTree

MODELS = os.path.dirname(os.path.abspath(__file__))
LENS = {'glass', 'reflexLens'}
KEEP_TRIS = 12
SHAPE = 0.12          # a mesh's tolerance is at most this share of its own size (its box's diagonal)

def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'dist': [1.5, 6.0, 20.0, 60.0], 'px': 0.5, 'fov': 75.0, 'height': 1080.0, 'force': False, 'what': []}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--force': o['force'] = True
        elif a == '--dist': i += 1; o['dist'] = sorted(float(x) for x in argv[i].split(','))
        elif a in ('--px', '--fov', '--height'): i += 1; o[a[2:]] = float(argv[i])
        elif a.startswith('--'): raise SystemExit('lod_kit: unknown option ' + a)
        else: o['what'].append(a)
        i += 1
    return o

def sources(what):
    """The .glb files to do: [(folder, file name)]. A folder counts when it has a model.json; every .glb directly in it is a source."""
    def of_dir(d):
        return [(d, f) for f in sorted(os.listdir(d)) if f.endswith('.glb')] if os.path.exists(os.path.join(d, 'model.json')) else []
    out = []
    if not what:
        for id in sorted(os.listdir(MODELS)):
            d = os.path.join(MODELS, id)
            if os.path.isdir(d) and id != 'parts': out += of_dir(d)
        pd = os.path.join(MODELS, 'parts')
        for slot in sorted(os.listdir(pd)):
            sd = os.path.join(pd, slot)
            if os.path.isdir(sd):
                for id in sorted(os.listdir(sd)):
                    if os.path.isdir(os.path.join(sd, id)): out += of_dir(os.path.join(sd, id))
        return out
    for w in what:
        p = w if os.path.isabs(w) else (os.path.join(MODELS, w) if os.path.exists(os.path.join(MODELS, w)) else os.path.abspath(w))
        if p.endswith('.glb') and os.path.isfile(p): out.append((os.path.dirname(p), os.path.basename(p)))
        elif os.path.isdir(p):
            got = of_dir(p)
            if not got: raise SystemExit('lod_kit: no model.json (or no .glb) in ' + p)
            out += got
        else: raise SystemExit('lod_kit: not a model folder or a .glb: ' + w)
    return out

def glb_json(path):
    with open(path, 'rb') as f: b = f.read()
    n = struct.unpack_from('<I', b, 12)[0]
    return json.loads(b[20:20 + n].decode('utf8'))

def glb_tris(j):
    t = 0
    for nd in j.get('nodes', []):
        if 'mesh' not in nd: continue
        for pr in j['meshes'][nd['mesh']]['primitives']:
            t += j['accessors'][pr['indices'] if 'indices' in pr else pr['attributes']['POSITION']]['count'] // 3
    return t

def tri_count(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)

def bvh_of(me):
    return BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons], all_triangles=False)

def open_edges(me):
    """How many edges are not shared by exactly two faces (0: a closed surface)."""
    n = {}
    for p in me.polygons:
        for k in p.edge_keys: n[k] = n.get(k, 0) + 1
    return sum(1 for c in n.values() if c != 2)

def samples_of(me, step):
    """The points a surface is measured at, each with the normal of the face it is on (None at a vertex): the vertices, and every triangle
    on a grid no coarser than step (at most 8 to a side; a triangle smaller than step: its centre)."""
    me.calc_loop_triangles()
    vs = [v.co.copy() for v in me.vertices]; pts = list(vs); nor = [None] * len(vs)
    for t in me.loop_triangles:
        a, b, c = (vs[i] for i in t.vertices); n = t.normal.copy()
        k = min(8, max(1, math.ceil(max((b - a).length, (c - b).length, (a - c).length) / step)))
        if k == 1: pts.append((a + b + c) / 3); nor.append(n); continue
        for i in range(k + 1):
            for j in range(k + 1 - i):
                if (i == 0 and j == 0) or i == k or j == k: continue
                pts.append(a + (b - a) * (i / k) + (c - a) * (j / k)); nor.append(n)
    return pts, nor

def far(samples, tree, tol, facing=False):
    """The furthest of the points from the surface, stopping at the first past tol (1e9: it has failed). facing: the surface there must
    also face the way the point's own face does (a box collapsed to a sheet is near every point of the box, and shows from one side only)."""
    worst = 0.0; pts, nor = samples
    for i, p in enumerate(pts):
        hit = tree.find_nearest(p)
        if hit[0] is None or hit[3] > tol: return 1e9
        if facing and nor[i] is not None and hit[1].dot(nor[i]) < -0.3:      # (the nearest faces the other way: is there one within tol that doesn't?)
            if not any(h[1].dot(nor[i]) >= -0.3 for h in tree.find_nearest_range(p, tol)): return 1e9
        if hit[3] > worst: worst = hit[3]
    return worst

class Simplifier:
    """One mesh of the source, measured against: `base` (the source itself, or its convex hull) decimated to a ratio."""
    def __init__(self, src, base):
        self.src = src; self.base = base; self.exact = base is src; self.n = tri_count(base); self.hi = 1.0
        self.tree = bvh_of(src); self.open = open_edges(src); self.cache = {}
        self.tmp = bpy.data.objects.new('lod_tmp', base); bpy.context.scene.collection.objects.link(self.tmp)
        self.md = self.tmp.modifiers.new('d', 'DECIMATE'); self.md.decimate_type = 'COLLAPSE'; self.md.use_collapse_triangulate = True
    def at(self, ratio):
        self.md.ratio = ratio
        bpy.context.view_layer.update()
        return bpy.data.meshes.new_from_object(self.tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    def ok(self, me, tol):
        """Within tol of the source both ways, facing the same way, and with no more open edges than it."""
        if not len(me.polygons) or open_edges(me) > self.open: return False
        if far(samples_of(me, tol), self.tree, tol) > tol: return False
        if tol not in self.cache: self.cache = {tol: samples_of(self.src, tol)}
        return far(self.cache[tol], bvh_of(me), tol, True) <= tol
    def level(self, tol):
        """The fewest triangles that are ok at tol (object units), at or under the level before's ratio: a new mesh, or None (the source as it
        is; for a hull: no use)."""
        hi = self.hi; lo = min(hi, 4.0 / max(4, self.n)); best = None
        me = self.at(lo)
        if self.ok(me, tol): self.hi = lo; return me
        bpy.data.meshes.remove(me)
        a, b = lo, hi                                    # (a fails; b passes, once looked at)
        if hi < 1.0 or not self.exact:
            me = self.at(hi)
            if self.ok(me, tol): best = (me, hi)
            else:
                bpy.data.meshes.remove(me)
                if not self.exact: return None           # (the hull itself is too far from the source)
                b = 1.0                                  # (not monotone here: look above it)
        for _ in range(9):
            if (b - a) * self.n < 2: break
            r = (a + b) / 2; me = self.at(r)
            if self.ok(me, tol):
                if best: bpy.data.meshes.remove(best[0])
                best = (me, r); b = r
            else: bpy.data.meshes.remove(me); a = r
        if not best: return None
        self.hi = best[1]; return best[0]
    def free(self):
        bpy.data.objects.remove(self.tmp, do_unlink=True)
        if not self.exact: bpy.data.meshes.remove(self.base)

def hull_of(src):
    """The source's convex hull, triangles (a new mesh), or None."""
    bm = bmesh.new(); bm.from_mesh(src)
    try:
        r = bmesh.ops.convex_hull(bm, input=bm.verts, use_existing_faces=False)
        hull = set(r.get('geom', []))
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in hull], context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bmesh.ops.triangulate(bm, faces=bm.faces[:]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        if len(bm.faces) < 4: return None
        me = bpy.data.meshes.new('lod_hull'); bm.to_mesh(me)
        for m in src.materials: me.materials.append(m)
        return me
    except Exception: return None
    finally: bm.free()

def shade(me):
    """Flat faces flat, round ones smooth: sharp where two faces meet at more than 30 degrees (the kit's smooth())."""
    for p in me.polygons: p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(30))

def export(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_extras=True, export_yup=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False,
                              export_animations=False)

def check(src_j, out_j, dropped, name):
    """A level's nodes are the source's (names, extras, parents, places), less the meshes left out. Returns the differences."""
    bad = []
    def table(j):
        par = {}
        for i, n in enumerate(j['nodes']):
            for c in n.get('children', []): par[c] = j['nodes'][i].get('name')
        return {n.get('name'): (n, par.get(i)) for i, n in enumerate(j['nodes'])}
    a, b = table(src_j), table(out_j)
    close = lambda x, y, d: all(abs(p - q) < 1e-5 for p, q in zip(x or d, y or d))
    for nm, (n, p) in a.items():
        if nm in dropped: continue
        if nm not in b: bad.append('node %s is gone' % nm); continue
        m, q = b[nm]
        if n.get('extras') != m.get('extras'): bad.append('node %s: extras differ' % nm)
        if p != q: bad.append('node %s: parent %s, was %s' % (nm, q, p))
        if not (close(n.get('translation'), m.get('translation'), [0, 0, 0]) and close(n.get('rotation'), m.get('rotation'), [0, 0, 0, 1]) and close(n.get('scale'), m.get('scale'), [1, 1, 1])):
            bad.append('node %s: moved' % nm)
        if ('mesh' in n) != ('mesh' in m): bad.append('node %s: mesh %s' % (nm, 'lost' if 'mesh' in n else 'gained'))
        elif 'mesh' in n:
            ma = lambda j, k: [j['materials'][pr['material']].get('name') if 'material' in pr else None for pr in j['meshes'][k['mesh']]['primitives']]
            if ma(src_j, n) != ma(out_j, m): bad.append('node %s: material %s, was %s' % (nm, ma(out_j, m), ma(src_j, n)))
    for nm in b:
        if nm not in a: bad.append('node %s is new' % nm)
    return ['%s: %s' % (name, x) for x in bad]

def do_file(folder, fname, levels, o):
    """One source .glb -> its levels. Returns the lods.json entry and the check's complaints."""
    src_path = os.path.join(folder, fname); base = fname[:-4]; out_dir = os.path.join(folder, 'lod')
    src_j = glb_json(src_path)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src_path, merge_vertices=True)
    meshes = [ob for ob in bpy.context.scene.objects if ob.type == 'MESH']
    # the source's meshes, kept (for the measuring and the normals) on objects of their own at the same place, out of the export
    keep = {}
    for ob in meshes:
        k = bpy.data.objects.new('lod_src_' + ob.name, ob.data); k.matrix_world = ob.matrix_world.copy(); keep[ob.name] = k
    sims = {}; hulls = {}; dropped = set(); entry = []; bad = []
    os.makedirs(out_dir, exist_ok=True)
    for lv in levels:
        t0 = time.time(); used_hull = 0
        for ob in list(meshes):
            name = ob.name; src = keep[name].data; n = tri_count(src)
            s = max(abs(c) for c in ob.matrix_world.to_scale()) or 1.0
            mat = src.materials[0].name if src.materials and src.materials[0] else ''
            plain = all(k == 'slot' for k in ob.keys())
            diag = (Vector(keep[name].bound_box[6]) - Vector(keep[name].bound_box[0])).length * s
            if plain and mat not in LENS and diag < lv['tol'] / o['px']:
                dropped.add(name); meshes.remove(ob); old = ob.data; bpy.data.objects.remove(ob, do_unlink=True)
                if old is not src and old.users == 0: bpy.data.meshes.remove(old)
                continue
            if mat in LENS or n <= KEEP_TRIS: continue
            if name not in sims: sims[name] = Simplifier(src, src)
            tol = min(lv['tol'], SHAPE * diag) / s                # (never so loose that the part loses its own shape)
            me = sims[name].level(tol)
            # the convex hull, where it is within the tolerance (a small or a far-off part: a closed, tidy stand-in), if it comes to fewer triangles
            if lv['lod'] >= 2 and (tri_count(me) if me else n) > KEEP_TRIS:
                if name not in hulls:
                    h = hull_of(src); hulls[name] = Simplifier(src, h) if h else None
                hm = hulls[name].level(tol) if hulls[name] else None
                if hm and tri_count(hm) < (tri_count(me) if me else n):
                    if me: bpy.data.meshes.remove(me)
                    me = hm; used_hull += 1
                elif hm: bpy.data.meshes.remove(hm)
            old = ob.data
            if me is None: ob.data = src
            else: shade(me); ob.data = me
            if old is not src and old is not ob.data and old.users == 0: bpy.data.meshes.remove(old)
        for ob in bpy.context.scene.objects: ob.hide_set(False)
        out = '%s.lod%d.glb' % (base, lv['lod'])
        # (the measuring's copies are in the scene's collection: out of it for the export)
        tmps = [x.tmp for x in list(sims.values()) + list(hulls.values()) if x]
        for t in tmps: bpy.context.scene.collection.objects.unlink(t)
        export(os.path.join(out_dir, out))
        for t in tmps: bpy.context.scene.collection.objects.link(t)
        out_j = glb_json(os.path.join(out_dir, out))
        bad += check(src_j, out_j, dropped, out)
        entry.append({'lod': lv['lod'], 'file': out, 'tris': glb_tris(out_j), 'meshes': sum(1 for nd in out_j['nodes'] if 'mesh' in nd), 'dropped': len(dropped), 'hulls': used_hull,
                      'bytes': os.path.getsize(os.path.join(out_dir, out)), 's': round(time.time() - t0, 1)})
    for x in list(sims.values()) + list(hulls.values()):
        if x: x.free()
    return {'tris': glb_tris(src_j), 'meshes': sum(1 for nd in src_j['nodes'] if 'mesh' in nd), 'levels': entry}, bad

def main():
    o = parse_args()
    pix = 2 * math.tan(math.radians(o['fov']) / 2) / o['height']          # (metres a pixel, a metre away)
    levels = [{'lod': i + 1, 'from': d, 'tol': round(d * pix * o['px'], 6)} for i, d in enumerate(o['dist'])]
    params = {'px': o['px'], 'fov': o['fov'], 'height': o['height'], 'v': 1}
    todo = sources(o['what']); by_dir = {}
    for d, f in todo: by_dir.setdefault(d, []).append(f)
    print('lod_kit: %d files; levels %s' % (len(todo), ', '.join('lod%d from %g m (%.2f mm)' % (l['lod'], l['from'], l['tol'] * 1000) for l in levels)))
    rows = []; complaints = []
    for d, files in by_dir.items():
        mf = os.path.join(d, 'lod', 'lods.json'); man = {}
        if os.path.exists(mf):
            try: man = json.load(open(mf, encoding='utf8'))
            except Exception: man = {}
        same = man.get('params') == params and man.get('levels') == levels
        out_files = man.get('files', {}) if same else {}
        for f in files:
            h = hashlib.sha1(open(os.path.join(d, f), 'rb').read()).hexdigest()[:16]
            had = out_files.get(f)
            if had and had.get('src') == h and not o['force'] and all(os.path.exists(os.path.join(d, 'lod', l['file'])) for l in had['levels']):
                rows.append((d, f, had, True)); continue
            e, bad = do_file(d, f, levels, o); e['src'] = h
            complaints += bad
            out_files[f] = e; rows.append((d, f, e, False))
        # (files whose source is gone leave the manifest, and their levels the folder)
        for f in [f for f in out_files if not os.path.exists(os.path.join(d, f))]:
            for l in out_files[f]['levels']:
                try: os.remove(os.path.join(d, 'lod', l['file']))
                except OSError: pass
            del out_files[f]
        os.makedirs(os.path.join(d, 'lod'), exist_ok=True)
        with open(mf, 'w', encoding='utf8', newline='\n') as fh:
            json.dump({'params': params, 'levels': levels, 'files': {k: out_files[k] for k in sorted(out_files)}}, fh, indent=1); fh.write('\n')
    print('\n%-52s %8s  %s' % ('source', 'tris', '  '.join('lod%d' % l['lod'] for l in levels)))
    for d, f, e, skipped in rows:
        rel = os.path.relpath(os.path.join(d, f), MODELS).replace(os.sep, '/')
        print('%-52s %8d  %s%s' % (rel, e['tris'], '  '.join('%d (%d%%, -%d)' % (l['tris'], round(100 * l['tris'] / max(1, e['tris'])), l['dropped']) for l in e['levels']), '   (unchanged)' if skipped else ''))
    if complaints:
        print('\nlod_kit: %d DIFFERENCES from the source (a level must keep its nodes):' % len(complaints))
        for c in complaints[:60]: print('  ' + c)
        raise SystemExit(1)
    print('\nlod_kit: done')

main()
