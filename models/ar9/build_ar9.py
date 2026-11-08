# The AR-9: a dedicated 9 mm lower (its well fitted to Glock magazines, the 33-round stick in it), a 9 mm blowback upper, an 8" barrel with a
# low-profile gas block under a 6.7" M-LOK handguard, folding sights on the rails (the rear on the upper, the front on the handguard's front),
# a six-position stock and an A2 grip; no forward assist or brass deflector, a shorter port.
#   blender -b -P models/ar9/build_ar9.py
# It sets CFG and runs the shared AR builder (models/ar_kit.py), which writes ar9.glb and ar9.blend.
import os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
mm = 0.001
CFG = {'lower': 'glock', 'forward_assist': False, 'deflector': False, 'port': (815, 935), 'stock': 'm4', 'grip': 'a2',
       'hg': 'mlok', 'hg_len': 0.170, 'barrel': 0.200, 'gas': 0.140, 'thr_r': 6.3 * mm, 'muzzle_sc': 0.92, 'mag': 'glock'}
g = {'GUN_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'ar_kit.py'), encoding='utf-8').read(), g)
result = g['result']
