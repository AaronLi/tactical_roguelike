# Brightline Pip red dot: an open-emitter rifle reflex, one-piece body with a QD clamp, a wide window with protective wings flaring forward (models/parts/optic/brightline_pip).
#   Blender: exec(open(r'<repo>/models/parts/optic/brightline_pip/build_brightline_pip.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/brightline_pip'})
#   or:      blender -b -P models/parts/optic/brightline_pip/build_brightline_pip.py
# It sets CFG and runs the shared open-emitter builder (models/parts/optic/open_kit.py), which writes brightline_pip.glb, brightline_pip.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'sy': 0.034, 'win': (0.032, 0.024), 'top': 'square', 'wings': True, 'qd': True, 'replaces': ['Brightline Pip red dot']}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'open_kit.py'), encoding='utf-8').read(), g)
result = g['result']
