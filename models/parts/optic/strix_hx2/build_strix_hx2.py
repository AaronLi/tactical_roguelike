# Strix HX-2 holographic: an open-sided square hood, a transverse battery cap on the right, buttons on the left, a QD lever (models/parts/optic/strix_hx2).
#   Blender: exec(open(r'<repo>/models/parts/optic/strix_hx2/build_strix_hx2.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/strix_hx2'})
#   or:      blender -b -P models/parts/optic/strix_hx2/build_strix_hx2.py
# It sets CFG and runs the shared holographic builder (models/parts/optic/holo_kit.py), which writes strix_hx2.glb, strix_hx2.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'battery': 'side', 'buttons': 'side', 'hood': 'square', 'qd': True, 'open': True, 'replaces': ['Strix HX-2 holographic']}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'holo_kit.py'), encoding='utf-8').read(), g)
result = g['result']
