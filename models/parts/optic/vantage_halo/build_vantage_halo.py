# Vantage Halo circle-dot sight: an open-emitter reflex with the widest window, a solar panel on the deck, a side battery tray (models/parts/optic/vantage_halo).
#   Blender: exec(open(r'<repo>/models/parts/optic/vantage_halo/build_vantage_halo.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/vantage_halo'})
#   or:      blender -b -P models/parts/optic/vantage_halo/build_vantage_halo.py
# It sets CFG and runs the shared open-emitter builder (models/parts/optic/open_kit.py), which writes vantage_halo.glb, vantage_halo.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'sy': 0.034, 'win': (0.032, 0.023), 'top': 'square', 'solar': True, 'tray': True, 'ret': 'cdot', 'replaces': ['Vantage Halo circle-dot sight']}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'open_kit.py'), encoding='utf-8').read(), g)
result = g['result']
