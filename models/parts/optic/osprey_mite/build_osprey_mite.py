# Osprey Mite green pistol dot: a slim carry sight, a low round-topped hood leaning well back, a green dot (models/parts/optic/osprey_mite).
#   Blender: exec(open(r'<repo>/models/parts/optic/osprey_mite/build_osprey_mite.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/osprey_mite'})
#   or:      blender -b -P models/parts/optic/osprey_mite/build_osprey_mite.py
# It sets CFG and runs the shared pistol-dot builder (models/parts/optic/pistol_kit.py), which writes osprey_mite.glb, osprey_mite.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'hood': 'arch', 'ret': 'dotG', 'replaces': ['Osprey Mite green pistol dot']}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'pistol_kit.py'), encoding='utf-8').read(), g)
result = g['result']
