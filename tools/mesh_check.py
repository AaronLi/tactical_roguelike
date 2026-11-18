# Mesh quality of one .blend, for tools/mesh_check.mjs (blender -b <file> --python tools/mesh_check.py -- <out.json>): every rendered mesh as the
# exporter triangulates it (loop triangles), each triangle flagged: 'long' (smallest angle < 2 deg, longest side > 1 cm), 'sliver' (< 5 deg,
# > 4 mm), 'zero' (no area), 'key' (from a keyhole n-gon: an outline that passes the same point twice); and the counts. .claude/skills/modeling-practices.
import bpy, bmesh, json, sys, math
out = sys.argv[sys.argv.index('--') + 1]
dg = bpy.context.evaluated_depsgraph_get()
_a = sys.argv[sys.argv.index('--') + 1:]; only = _a[1].split(',') if len(_a) > 1 and _a[1] else None   # (only these slots, or object names)
objs = [o for o in bpy.data.objects if o.type == 'MESH' and not o.hide_render and (not only or o.get('slot') in only or o.name in only)]
tris, edges = [], []
S = dict(objects=0, verts=0, faces=0, tris=0, ngons=0, keyhole=0, keyhole_tris=0, slivers=0, long_slivers=0, zero=0, open=0, nonmanifold=0, dups=0, overlap_faces=0)
per = {}
def ang(a, b, c):
    u, v = b - a, c - a
    lu, lv = u.length, v.length
    if lu < 1e-12 or lv < 1e-12: return 0.0
    return math.degrees(u.angle(v)) if True else 0
for o in objs:
    ev = o.evaluated_get(dg); me = ev.to_mesh()
    me.transform(o.matrix_world)
    me.calc_loop_triangles()
    S['objects'] += 1; S['verts'] += len(me.vertices); S['faces'] += len(me.polygons)
    bm = bmesh.new(); bm.from_mesh(me)
    for e in bm.edges:
        n = len(e.link_faces)
        if n == 1: S['open'] += 1
        elif n > 2: S['nonmanifold'] += 1
    seen = set()
    for v in bm.verts:
        k = (round(v.co.x, 5), round(v.co.y, 5), round(v.co.z, 5))
        if k in seen: S['dups'] += 1
        seen.add(k)
    fseen = set()
    for f in bm.faces:
        k = tuple(sorted((round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4)) for v in f.verts))
        if k in fseen: S['overlap_faces'] += 1
        fseen.add(k)
    bm.free()
    # keyhole n-gons: a face whose outline passes the same spot twice (a hole joined by a zero-width bridge)
    key = set()
    for p in me.polygons:
        if p.loop_total > 4:
            S['ngons'] += 1
            pts = [tuple(round(c, 5) for c in me.vertices[i].co) for i in p.vertices]
            if len(set(pts)) < len(pts): key.add(p.index); S['keyhole'] += 1
    bad = 0
    for t in me.loop_triangles:
        a, b, c = (me.vertices[i].co for i in t.vertices)
        ls = sorted([(b - a).length, (c - b).length, (a - c).length])
        area = t.area
        mn = min(ang(a, b, c), ang(b, c, a), ang(c, a, b))
        fl = ''
        if area < 1e-10: fl = 'zero'; S['zero'] += 1
        elif mn < 2.0 and ls[2] > 0.01:
            fl = 'long' ; S['long_slivers'] += 1; bad += 1
        elif mn < 5.0 and ls[2] > 0.004:
            fl = 'sliver'; S['slivers'] += 1; bad += 1
        if t.polygon_index in key: S['keyhole_tris'] += 1; fl = fl or 'key'
        S['tris'] += 1
        n = t.normal
        tris.append([[round(a.x, 5), round(a.y, 5), round(a.z, 5)], [round(b.x, 5), round(b.y, 5), round(b.z, 5)], [round(c.x, 5), round(c.y, 5), round(c.z, 5)], fl, [round(n.x, 3), round(n.y, 3), round(n.z, 3)]])
    per[o.name] = dict(tris=len(me.loop_triangles), bad=bad, key=len(key))
    ev.to_mesh_clear()
worst = sorted(per.items(), key=lambda kv: -kv[1]['bad'])[:6]
S['worst'] = [[k, v['bad'], v['tris'], v['key']] for k, v in worst if v['bad']]
json.dump(dict(stats=S, tris=tris), open(out, 'w'))
