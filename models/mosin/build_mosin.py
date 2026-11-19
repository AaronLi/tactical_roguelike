# The Mosin-Nagant: the Model 1891/30 (the rifle of the Red Army, 7.62x54R, 5 rounds in a fixed box magazine charged from a stripper clip through the open action) with
# the bent bolt handle of the scoped 91/30 sniper version, in Blender.
#   blender -b -P models/mosin/build_mosin.py     (or exec it in Blender with GUN_DIR set to models/mosin)
# Which gun: the game's "Mosin-Nagant" is a 7.62x54R with a 28.7" (729 mm) barrel, five rounds loaded one round at a time (shell, reload 0.5) and scoped: the 91/30, with the
# sniper variant's bent bolt handle (a scope on the receiver needs the handle swept down). The 28.7" barrel is the 91/30's 730 mm; the stock fore-end 0.62 m long to the nose cap.
# Reference: no photograph was traced (the browser pane was at its tab cap): the figures are the published ones. Overall 1232 mm, barrel 730 mm, 4.0 kg, receiver 138 mm long
# and 33 mm across, a bolt stroke of about 105 mm, a tangent leaf rear sight on the barrel ahead of the receiver, a hooded post front sight on its base at the muzzle, two barrel
# bands and a nose cap, a stripper-clip guide on the receiver's rear bridge, a hinged floorplate with its guard, a steel butt plate.
# Frame: Blender X = right, Y = forward, Z = up, metres; ORIGIN = the back of the receiver on the bore line.
# Parts: base = receiver (clip guide, the open top, ring), trigger group, guard, rear sight base; stock = the butt and the receiver's bed; handguard = the fore-end, the upper
# handguard, the bands and nose cap; barrel (with its front sight base and hood); muzzle = the crown cap; optic = the tangent rear sight (the model's own irons);
# mag = the hinged floorplate (the internal magazine's: the detachable box replaces it); part_bolt = the bolt and its bent handle.
import bpy, json, math, os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.dirname(HERE)
exec(open(os.path.join(MODELS, 'blender_kit.py'), encoding='utf-8').read(), globals())
exec(open(os.path.join(MODELS, 'bolt_kit.py'), encoding='utf-8').read(), globals())
KIT_COL.update({'wood': (0.30, 0.15, 0.06, 1), 'woodDark': (0.2, 0.1, 0.05, 1), 'woodRed': (0.35, 0.12, 0.06, 1)})
ID = 'mosin'
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'
mm = 0.001
coll, root = kit_collection(ID)
K = Kit(coll, root)

RB = 16.5 * mm                     # the receiver's radius
BORE = 12.0 * mm                   # the bolt way
F_REAR = 0.1380                    # the receiver tube's front; the ring runs to F_RING
F_RING = 0.176
F_MOUTH = 0.1405                   # the chamber's mouth
RND = (0.0073, 0.0516)             # the game's 7.62x54R round (case head radius: the rim, length); its case is drawn 0.72 of it
CASE = 0.72 * RND[1]
FACE = 0.1343                      # the bolt face closed: against the chamber, at the loading window's front edge (0.1335): the case head in the bolt face, the whole case in the ring
MUZ = 0.870                        # the barrel's end
SY = 0.0295                        # the sight line over the bore

# ================================================================================================ the receiver (base): tube, open top, clip guide, ring
rc = K.tmp(lathe([(0, RB * 0.985), (0.0008, RB), (F_REAR, RB), (F_REAR + 0.002, RB * 1.04), (F_RING, RB * 1.04)], segs(RB)))
cut(rc, cyl(BORE, -0.002, F_MOUTH - 2.0 * mm, 'y', (0, 0), 20))                                        # the bolt way
cut(rc, port_pocket(0.054, 0.1335, -0.0040, RB + 0.004, 0.03, 2.5 * mm, -0.0102))                      # the open top and right of the loading window
cut(rc, box(0.0075, 0.03, 0.040, 0.084, -0.0075, 0.0030))                                              # the handle's notch, on the right behind the window
wnorm(rc, 30); K.adopt(rc, 'base', 'blued')
port_inside(K, 0.054, 0.1335, -0.0060, 0.012, RB, mouth_r=7.6 * mm, ramp=24 * mm, x_in=-0.0102)
# the stripper clip guide: a raised bridge on the receiver's rear with the clip's slot in it, and the notch in the front bridge
g = K.tmp(prism([(0.012, RB - 0.003), (0.012, RB + 0.0035), (0.0255, RB + 0.0050), (0.046, RB + 0.0050), (0.050, RB + 0.0035), (0.050, RB - 0.003)], 'x', -0.0105, 0.0105))
cut(g, box(-0.0028, 0.0028, 0.008, 0.054, RB + 0.0009, RB + 0.0100)); bevel(g, 0.0007, 1, 40); wnorm(g); K.adopt(g, 'base', 'blued')
K.obj(box(-0.0024, 0.0024, 0.0145, 0.0515, RB + 0.0010, RB + 0.0014), 'base', 'black')                  # the slot's floor
put(K, box(-0.0105, 0.0105, 0.0125, 0.0165, RB + 0.0049, RB + 0.0057), 'base', 'steel')               # its rear lip
# the barrel shoulder and the rear sight's base (a block with a dovetail), the barrel's shank to the handguard
put(K, lathe([(F_RING, 0.0160), (0.2380, 0.0150)], segs(0.0150)), 'base', 'blued')
put(K, box(-0.0100, 0.0100, 0.1800, 0.2360, 0.0118, 0.0212), 'base', 'blued', bev=0.0008)
put(K, box(-0.0106, 0.0106, 0.1800, 0.1830, 0.0100, 0.0200), 'base', 'gunmetal', bev=0.0005)
# the trigger group, the guard bow with its trigger (photo: the hook at x 1125, 8 mm ahead of the receiver's back; the bow from -3 to 53 mm, 91 mm under the bore), the box magazine
put(K, box(-0.0105, 0.0105, -0.012, 0.040, -0.0300, -0.0130), 'base', 'blued', bev=0.001)
g = K.tmp(prism([(-0.003, -0.0130), (-0.003, -0.0800), (0.010, -0.0905), (0.040, -0.0905), (0.053, -0.0820), (0.053, -0.0130)], 'x', -0.0042, 0.0042))
cut(g, prism([(0.0035, -0.0285), (0.0035, -0.0760), (0.0125, -0.0840), (0.0375, -0.0840), (0.0465, -0.0760), (0.0465, -0.0285)], 'x', -0.006, 0.006))
bevel(g, 0.0008, 1, 40); wnorm(g); K.adopt(g, 'base', 'blued')
put(K, prism([(0.0000, -0.0290), (0.0060, -0.0290), (0.0110, -0.0750), (0.0050, -0.0750)], 'x', -0.0030, 0.0030), 'base', 'gunmetal', bev=0.0006)   # the trigger
put(K, prism([(0.053, -0.0300), (0.177, -0.0300), (0.177, -0.0520), (0.053, -0.0780)], 'x', -0.0125, 0.0125), 'base', 'blued', bev=0.001)   # the box magazine under the receiver: its floor slopes up to the fore-end
# the safety: the cocking piece's tab turned (the Mosin has none on the receiver: its safety is the bolt's cocking piece, below). A sling-slot ring and the bolt-stop on the left rear
put(K, box(-0.0225, -0.0150, 0.0560, 0.0640, -0.0040, 0.0040), 'base', 'gunmetal', bev=0.0006)         # the bolt stop (the magazine cut-off's neighbour) on the left

# ================================================================================================ the stock (wood): butt, wrist, the receiver's bed, the lower fore-end's start
# traced off the 91/30 sniper photo (Wikimedia Commons "Mosin-Nagant m91-30 sniper noBG.png", CC BY-SA 3.0, 3840 x 877 with alpha, left side): 0.3343 mm a pixel from the gun's 1232 mm overall
# length; origin the receiver's back (photo x 1100), the bore line y 299.5 (the muzzle's). The stock's top is 31 mm UNDER the bore along the comb, a scoop behind the receiver, the heel 50 mm
# under it; the belly a long slope up from a toe 160 mm under the bore; the butt plate leans back at the top (the stock is 361 mm from the trigger to the heel).
BUTT = -0.351
SIDE = [(-0.351, -0.0520), (-0.343, -0.0506), (-0.334, -0.0490), (-0.326, -0.0460), (-0.318, -0.0443), (-0.309, -0.0430), (-0.301, -0.0416), (-0.292, -0.0403), (-0.284, -0.0393),
        (-0.276, -0.0383), (-0.268, -0.0373), (-0.251, -0.0359), (-0.234, -0.0346), (-0.217, -0.0333), (-0.201, -0.0319), (-0.184, -0.0313), (-0.167, -0.0309), (-0.134, -0.0309),
        (-0.117, -0.0363), (-0.100, -0.0379), (-0.084, -0.0343), (-0.067, -0.0293), (-0.050, -0.0236), (-0.033, -0.0172), (-0.017, -0.0102), (0.0, -0.0030), (F_RING, -0.0030),
        (F_RING, -0.0485), (0.134, -0.0470), (0.066, -0.0540), (0.0, -0.0620), (-0.017, -0.0690), (-0.033, -0.0727), (-0.050, -0.0774), (-0.067, -0.0821), (-0.084, -0.0871),
        (-0.100, -0.0921), (-0.117, -0.0974), (-0.134, -0.1030), (-0.150, -0.1080), (-0.167, -0.1135), (-0.184, -0.1190), (-0.201, -0.1245), (-0.217, -0.1300), (-0.234, -0.1350),
        (-0.251, -0.1400), (-0.276, -0.1480), (-0.301, -0.1530), (-0.326, -0.1570), (-0.343, -0.1600), (-0.347, -0.1585)]
PLAN = [(-0.36, 0.0190), (-0.25, 0.0195), (-0.12, 0.0180), (-0.05, 0.0190), (0.0, 0.0205), (F_RING + 0.01, 0.0210)]
cuts = [cyl(RB + 0.5 * mm, -0.06, F_RING + 0.02, 'y', (0, 0), 20),
        box(-0.0115, 0.0115, -0.012, 0.055, -0.095, -0.0130)]
body(K, SIDE, PLAN, 'stock', 'wood', bev=0.010, seg=3, cuts=cuts, round_first=True)   # (a rounded section: the wood furniture's edges are 10 mm rounds, not squares)
# the steel butt plate (leaning back at the top) with its two screws, and the sling slot through the butt (dark)
put(K, prism([(-0.3465, -0.0525), (-0.3560, -0.0545), (-0.3500, -0.1600), (-0.3400, -0.1600)], 'x', -0.0198, 0.0198), 'stock', 'steel', bev=0.0050)
for z in (-0.060, -0.140):
    put(K, cyl(2.2 * mm, BUTT - 0.0050, BUTT - 0.0030, 'y', (0, z), segs(2.2 * mm)), 'stock', 'gunmetal')
for sd in (-1, 1):
    put(K, prism([(-0.1750, -0.0590), (-0.1500, -0.0590), (-0.1500, -0.0640), (-0.1750, -0.0640)], 'x', sd * 0.0185, sd * 0.0190), 'stock', 'black')

# ================================================================================================ the fore-end and upper handguard (handguard slot), the bands, the nose cap
HG0, HG1 = F_RING, 0.796
HSIDE = [(HG0, -0.0030), (0.300, -0.0030), (0.330, 0.0060), (0.370, 0.0095), (0.745, 0.0102), (0.780, 0.0065), (HG1, 0.0065), (HG1, -0.0235), (0.745, -0.0246), (0.679, -0.0252),
         (0.612, -0.0259), (0.545, -0.0266), (0.478, -0.0272), (0.411, -0.0279), (0.378, -0.0282), (0.344, -0.0353), (0.311, -0.0399), (0.277, -0.0440), (0.2435, -0.0476), (HG0, -0.0485)]
HPLAN = [(HG0 - 0.01, 0.0210), (0.30, 0.0185), (0.60, 0.0165), (HG1, 0.0155), (HG1 + 0.01, 0.0155)]
body(K, HSIDE, HPLAN, 'handguard', 'wood', bev=0.012, seg=3, round_first=True, cuts=[rod((0, HG0 - 0.02, 0), (0, 0.400, 0), 0.0155, 0.0086, 20), rod((0, 0.400, 0), (0, HG1 + 0.02, 0), 0.0086, 0.0082, 20)])   # (the upper handguard is the fore-end's own top, 10 mm over the bore)
for fb, w, cz, hh in ((0.3720, 0.013, -0.0085, 0.0196), (0.6970, 0.012, -0.0075, 0.0178)):               # the two barrel bands
    o = K.tmp(prism(rounded(0, cz, 0.0185, hh + 0.0014, 0.010, 3), 'y', fb, fb + w))
    cut(o, prism(rounded(0, cz, 0.0166, hh - 0.0006, 0.008, 3), 'y', fb - 0.001, fb + w + 0.001))
    bevel(o, 0.0006, 1, 40); wnorm(o); K.adopt(o, 'handguard', 'gunmetal')
put(K, box(-0.0035, 0.0035, 0.7040, 0.7080, -0.0345, -0.0235), 'handguard', 'steel', bev=0.0004)         # the front band's sling swivel
nc = K.tmp(prism(rounded(0, -0.0082, 0.0166, 0.0156, 0.010, 3), 'y', HG1 - 0.012, HG1 + 0.012)); cut(nc, rod((0, HG1 - 0.03, 0), (0, HG1 + 0.03, 0), 0.0078, 0.0078, 24))
bevel(nc, 0.0008, 1, 40); wnorm(nc); K.adopt(nc, 'handguard', 'steel')                                    # the nose cap

# ================================================================================================ the barrel (slot barrel): the 91/30's 730 mm, the front sight base and hood, then the crown cap (slot muzzle)
bar = K.tmp(lathe([(0.2380, 0.0125), (0.30, 0.0100), (0.370, 0.0083), (0.80, 0.0076), (0.846, 0.0076)], segs(0.0125))); wnorm(bar, 30); K.adopt(bar, 'barrel', 'blued')
FB = 0.846
put(K, lathe([(FB, 0.0086), (FB + 0.001, 0.0096), (MUZ - 0.0035, 0.0096), (MUZ - 0.0025, 0.0084), (MUZ, 0.0076)], segs(0.0096)), 'barrel', 'blued')
put(K, rod((0, 0.790, -0.0195), (0, 0.853, -0.0195), 0.0033, 0.0033, 12), 'barrel', 'steel')   # the cleaning rod's end, out of the nose cap       # the front sight's base
put(K, box(-0.0032, 0.0032, FB + 0.006, MUZ - 0.006, 0.0085, 0.0200), 'barrel', 'blued', bev=0.0005)                                          # its block
hood = K.tmp(prism([(math.cos(a / 14 * 2 * math.pi) * 0.0098, SY + math.sin(a / 14 * 2 * math.pi) * 0.0098) for a in range(14)], 'y', FB + 0.0060, FB + 0.0210))
cut(hood, cyl(0.0082, FB, FB + 0.04, 'y', (0, SY), segs(0.0082))); wnorm(hood); K.adopt(hood, 'barrel', 'blued')                                         # the hood round the post
put(K, box(-0.0030, 0.0030, FB + 0.0105, FB + 0.0150, 0.0185, SY - 0.0095), 'barrel', 'blued', bev=0.0004)                                    # the web joining the hood to the block
put(K, prism([(FB + 0.0125, 0.0200), (FB + 0.0150, 0.0200), (FB + 0.0150, SY), (FB + 0.0125, SY)], 'x', -0.0008, 0.0008), 'barrel', 'black', bev=0.0002)   # the post (a thin blade)
cap = K.tmp(lathe([(MUZ, 0.0076), (MUZ + 0.0008, 0.0079), (MUZ + 0.0098, 0.0079), (MUZ + 0.0110, 0.0068), (MUZ + 0.0110, 0.0035), (MUZ + 0.0088, 0.0035)], segs(0.0079))); wnorm(cap, 30); K.adopt(cap, 'muzzle', 'black')
MUZ_TIP = MUZ + 0.0110

# ================================================================================================ the tangent rear sight, folded down: the notch block at its rear is the battle sight (optic: the model's own irons)
RS = 0.1815
rsb = K.tmp(prism([(0.1790, 0.0212), (0.1840, 0.0212), (0.1865, 0.0350), (0.1790, 0.0350)], 'x', -0.0085, 0.0085))
cut(rsb, prism([(-0.0062, 0.0360), (0.0062, 0.0360), (0.0, 0.0245)], 'y', 0.170, 0.195)); bevel(rsb, 0.0005, 1, 40); wnorm(rsb); K.adopt(rsb, 'optic', 'gunmetal')   # (the V notch: 5.5 mm wide at the sight line)
put(K, box(-0.0080, 0.0080, 0.1840, 0.2330, 0.0212, 0.0236), 'optic', 'steel', bev=0.0005)                      # the leaf folded forward over the base
put(K, box(-0.0082, 0.0082, 0.1990, 0.2085, 0.0236, 0.0275), 'optic', 'gunmetal', bev=0.0005)                   # the slider
for i in range(5): put(K, box(-0.0075, 0.0075, 0.2100 + i * 0.0045, 0.2108 + i * 0.0045, 0.0236, 0.0242), 'optic', 'blued')   # the range graduations

# ================================================================================================ the floorplate (slot mag): the hinged plate and its catch
put(K, prism([(0.055, -0.0775), (0.177, -0.0515), (0.177, -0.0560), (0.055, -0.0820)], 'x', -0.0125, 0.0125), 'mag', 'blued', bev=0.0008)
put(K, box(-0.0035, 0.0035, 0.0480, 0.0580, -0.0900, -0.0780), 'mag', 'gunmetal', bev=0.0006)

# ================================================================================================ the bolt (part_bolt): body, bolt head, sleeve, cocking piece with its tab, bent handle, round knob
PIV = 0.0820
HANDLE = [(0.0110, PIV, -0.0020, 0.0052), (0.0440, PIV - 0.0040, -0.0040, 0.0048), (0.0650, PIV - 0.0120, -0.0260, 0.0044)]
KNOB = (0.0690, PIV - 0.0130, -0.0345, 0.0102, (0.82, 0.95, 1.0))
bolt_group(K, K, PIV, rear=-0.046, face=FACE, rb=0.0098, handle=HANDLE, knob=KNOB, sleeve=(-0.004, 0.046, 0.0108), cock=(0.0062, 0.016), lug_r=0.0106,
           knob_mat='blued', handle_mat='blued')

# ================================================================================================ info and anchors
info = {
    'sy': SY, 'fSight': RS, 'relief': 0.075,
    'muzzles': [[round(MUZ_TIP, 4), 0, 0]],
    'grip': [0.012, -0.060, 0], 'support': [0.42, -0.026, 0],
    'anim': {'bolt': 'part_bolt'},
    'port': [0.094, 0.0, round(RB, 4)],
    'bolt': [round(KNOB[1], 4), round(KNOB[2], 4), round(KNOB[0], 4)],
    'boltTravel': 0.105,
    'chamberAt': {'side': 'port', 'f': round(FACE, 4), 'y': RND[0], 'x': 0.0},
}
anchors = {
    'mount_optic': [0.0, round(RB, 4), 0], 'mount_optic_end': [0.170, round(RB, 4), 0],
    'mount_handguard': [round(HG0, 4), 0, 0], 'mount_handguard_end': [0.855, 0, 0],
    'mount_barrel': [0.856, 0, 0], 'mount_muzzle': [MUZ, 0, 0],
    'mount_stock': [0, -0.002, 0], 'mount_grip': [0.05, -0.0165, 0],
    'mount_mag': [0.1160, -0.0670, 0],
}
root['gun'] = ID; root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
bad = sweep_check(coll)
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb], 'bad': bad,
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
print('RESULT', json.dumps(result))
