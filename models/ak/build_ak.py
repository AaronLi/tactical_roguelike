# The KV-47 (game id ak): an AKM, the stamped-receiver 7.62 x 39 Kalashnikov (880 mm, a 415 mm barrel), its laminated wood furniture,
# the 45-degree gas block, the slant compensator, the steel 30-round magazine; a railed dust cover for the optic mount.
#   Blender: exec(open(r'<repo>/models/ak/build_ak.py').read(), {'GUN_DIR': r'<repo>/models/ak'})
#   or:      blender -b -P models/ak/build_ak.py
# It sets CFG and runs the shared AK builder (models/ak_kit.py), which writes ak.glb, ak.blend and model.json.
import os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'variant': 'akm', 'barrels': [10.5, 12.5, 16, 20, 23.2]}   # (the other barrels: variants beside the gun, barrel_<len>.glb)
g = {'GUN_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'ak_kit.py'), encoding='utf-8').read(), g)
result = g['result']
