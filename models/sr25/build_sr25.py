# The SR-25: the AR-10 pattern (receivers 1.13x as long and 1.06x as tall as the AR-15's), a 20" heavy barrel (508 mm from the bolt face: 0.50 m ahead of the
# upper), a 13.4" M-LOK handguard, a rifle-length gas block under it, folding sights, a 7.62 A2 flash hider, the 20-round 7.62 magazine.
#   blender -b -P models/sr25/build_sr25.py
# It sets CFG and runs the shared AR builder (models/ar_kit.py), which writes sr25.glb and sr25.blend.
import os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
mm = 0.001
CFG = {'rx': 1.13, 'ry': 1.06, 'stock': 'm4', 'grip': 'mod', 'hg': 'mlok', 'hg_len': 0.340, 'barrel': 0.500, 'mag_len': 0.130, 'bore_r': 11.5 * mm,
       'thr_r': 8.0 * mm, 'gas': 0.300, 'muzzle_sc': 1.12, 'mag': '762'}
g = {'GUN_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'ar_kit.py'), encoding='utf-8').read(), g)
result = g['result']
