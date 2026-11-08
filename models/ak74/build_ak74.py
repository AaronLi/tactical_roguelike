# The AK-74M (game id ak74): the 5.45 x 39 Kalashnikov (943 mm), its black polymer furniture and side-folding stock,
# the square-fronted gas block, the two-chamber muzzle brake, the plum 30-round magazine, a railed dust cover for the optic mount.
#   Blender: exec(open(r'<repo>/models/ak74/build_ak74.py').read(), {'GUN_DIR': r'<repo>/models/ak74'})
#   or:      blender -b -P models/ak74/build_ak74.py
# It sets CFG and runs the shared AK builder (models/ak_kit.py), which writes ak74.glb, ak74.blend and model.json.
import os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'variant': 'ak74'}
g = {'GUN_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'ak_kit.py'), encoding='utf-8').read(), g)
result = g['result']
