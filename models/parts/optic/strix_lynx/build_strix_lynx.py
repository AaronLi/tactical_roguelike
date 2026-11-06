# Strix Lynx 1.5x prism (models/parts/optic/strix_lynx): Strix's angular faceted housing, a mid-size objective, the illumination dial set forward.
#   Blender: exec(open(r'<repo>/models/parts/optic/strix_lynx/build_strix_lynx.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/strix_lynx'})
#   or:      blender -b -P models/parts/optic/strix_lynx/build_strix_lynx.py
# It sets CFG and runs the shared prism builder (models/parts/optic/prism_kit.py), which writes strix_lynx.glb, strix_lynx.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'len': 0.052, 'obj_r': 0.0155, 'obj_len': 0.010, 'hw': 0.0165, 'hh': 0.0155, 'facets': True, 'eyecup': 0.008, 'eye_r': 0.0128, 'base_len': 0.048, 'dial_df': 0.010, 'turret_f': -0.004, 'replaces': ['Strix Lynx 1.5× prism']}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'prism_kit.py')).read(), g)
result = g['result']
