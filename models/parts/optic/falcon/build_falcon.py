# Strix Falcon open reflex (models/parts/optic/falcon): a low open-emitter rifle reflex, a big round lens (26 mm) on a long solid
# body (an AAA in a tube along its left side), a cross-bolt clamp. A catalogue part of its own (op.auth.falcon: model.json's part block).
#   Blender: exec(open(r'<repo>/models/parts/optic/falcon/build_falcon.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/falcon'})
#   or:      blender -b -P models/parts/optic/falcon/build_falcon.py
# It sets CFG and runs the shared open-emitter builder (models/parts/optic/open_kit.py), which writes falcon.glb, falcon.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'sy': 0.0285, 'win': (0.026, 0.026), 'top': 'circle', 'lean': 8, 'battery': 'aaa', 'bat_side': -1, 'relief': 0.09,
       'part': {'mount': 'op:pic', 'brand': 'strix', 'name': 'Strix Falcon open reflex', 'price': 340, 'tier': 1, 'zoom': 0.8, 'st': {'ergo': -1, 'acc': -2, 'hip': 2}}}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'open_kit.py'), encoding='utf-8').read(), g)
result = g['result']
