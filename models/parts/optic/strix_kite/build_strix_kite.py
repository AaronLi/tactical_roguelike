# Strix Kite pistol red dot: an upright shroud with thick straight walls and a flat top (a duty sight) (models/parts/optic/strix_kite).
#   Blender: exec(open(r'<repo>/models/parts/optic/strix_kite/build_strix_kite.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/strix_kite'})
#   or:      blender -b -P models/parts/optic/strix_kite/build_strix_kite.py
# It sets CFG and runs the shared pistol-dot builder (models/parts/optic/pistol_kit.py), which writes strix_kite.glb, strix_kite.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'hood': 'shroud', 'replaces': ['Strix Kite pistol red dot']}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'pistol_kit.py'), encoding='utf-8').read(), g)
result = g['result']
