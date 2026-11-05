# Kodiak Keep enclosed pistol dot: an enclosed box, the window a tunnel through it, glass at both ends (models/parts/optic/kodiak_keep).
#   Blender: exec(open(r'<repo>/models/parts/optic/kodiak_keep/build_kodiak_keep.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/kodiak_keep'})
#   or:      blender -b -P models/parts/optic/kodiak_keep/build_kodiak_keep.py
# It sets CFG and runs the shared pistol-dot builder (models/parts/optic/pistol_kit.py), which writes kodiak_keep.glb, kodiak_keep.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'hood': 'closed', 'replaces': ['Kodiak Keep enclosed pistol dot']}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'pistol_kit.py'), encoding='utf-8').read(), g)
result = g['result']
