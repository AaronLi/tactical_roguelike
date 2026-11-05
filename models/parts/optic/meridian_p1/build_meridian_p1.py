# Meridian P1 1x prism (models/parts/optic/meridian_p1): the compact Meridian: a short chamfered body with side ribs, a wide objective, a short eyecup.
#   Blender: exec(open(r'<repo>/models/parts/optic/meridian_p1/build_meridian_p1.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/meridian_p1'})
#   or:      blender -b -P models/parts/optic/meridian_p1/build_meridian_p1.py
# It sets CFG and runs the shared prism builder (models/parts/optic/prism_kit.py), which writes meridian_p1.glb, meridian_p1.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'len': 0.040, 'obj_r': 0.0150, 'obj_len': 0.008, 'hw': 0.0170, 'hh': 0.0150, 'chamfer': 0.005, 'ribs': 3, 'eyecup': 0.006, 'eye_r': 0.0130, 'base_len': 0.044, 'riser': 0.015, 'replaces': ['Meridian P1 1× prism']}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'prism_kit.py')).read(), g)
result = g['result']
