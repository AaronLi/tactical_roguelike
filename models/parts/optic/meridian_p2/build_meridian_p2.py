# Meridian P2 2x prism (models/parts/optic/meridian_p2): the longer Meridian: the same chamfered, ribbed body, a bigger objective with a sunshade lip, a longer eyecup.
#   Blender: exec(open(r'<repo>/models/parts/optic/meridian_p2/build_meridian_p2.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/meridian_p2'})
#   or:      blender -b -P models/parts/optic/meridian_p2/build_meridian_p2.py
# It sets CFG and runs the shared prism builder (models/parts/optic/prism_kit.py), which writes meridian_p2.glb, meridian_p2.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'len': 0.062, 'obj_r': 0.0175, 'obj_len': 0.012, 'sunshade': 0.006, 'hw': 0.0170, 'hh': 0.0155, 'chamfer': 0.005, 'ribs': 4, 'eyecup': 0.010, 'eye_r': 0.0130, 'base_len': 0.050, 'turret_f': -0.003, 'replaces': ['Meridian P2 prism 2×']}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'prism_kit.py')).read(), g)
result = g['result']
