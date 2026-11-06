# Strix Owlet micro dot: a 28 mm micro tube through a square centre block with turret guards (models/parts/optic/strix_owlet).
#   Blender: exec(open(r'<repo>/models/parts/optic/strix_owlet/build_strix_owlet.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/strix_owlet'})
#   or:      blender -b -P models/parts/optic/strix_owlet/build_strix_owlet.py
# It sets CFG and runs the shared tube red-dot builder (models/parts/optic/tube_kit.py), which writes strix_owlet.glb, strix_owlet.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'R': 0.014, 'L': 0.040, 'block': True, 'guards': True, 'turret_r': 4.2 * 0.001, 'dial_r': 5.2 * 0.001, 'turret_f': 0.0, 'base_len': 0.030, 'replaces': ['Strix Owlet micro dot']}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'tube_kit.py'), encoding='utf-8').read(), g)
result = g['result']
