# Halcyon TA-3 3x prism (models/parts/optic/halcyon_ta3): Halcyon's heavier body (big chamfers, two ribs), the largest objective with a sunshade, the longest eyecup.
#   Blender: exec(open(r'<repo>/models/parts/optic/halcyon_ta3/build_halcyon_ta3.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/halcyon_ta3'})
#   or:      blender -b -P models/parts/optic/halcyon_ta3/build_halcyon_ta3.py
# It sets CFG and runs the shared prism builder (models/parts/optic/prism_kit.py), which writes halcyon_ta3.glb, halcyon_ta3.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'len': 0.070, 'obj_r': 0.0195, 'obj_len': 0.014, 'sunshade': 0.008, 'hw': 0.0180, 'hh': 0.0160, 'chamfer': 0.007, 'ribs': 2, 'eyecup': 0.012, 'eye_r': 0.0135, 'base_len': 0.054, 'turret_f': -0.004, 'turret_r': 0.0072, 'replaces': ['Halcyon TA-3 3× prism']}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'prism_kit.py')).read(), g)
result = g['result']
