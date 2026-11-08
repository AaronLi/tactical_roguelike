# The RPK (game id rpk): the Kalashnikov light machine gun (1040 mm, a 590 mm heavy barrel), the AKM's receiver and gas system,
# its club-foot stock, the front sight at the muzzle with the bipod behind it, the thread protector, the 40-round magazine, a railed dust cover for the optic mount.
#   Blender: exec(open(r'<repo>/models/rpk/build_rpk.py').read(), {'GUN_DIR': r'<repo>/models/rpk'})
#   or:      blender -b -P models/rpk/build_rpk.py
# It sets CFG and runs the shared AK builder (models/ak_kit.py), which writes rpk.glb, rpk.blend and model.json.
import os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'variant': 'rpk'}
g = {'GUN_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'ak_kit.py'), encoding='utf-8').read(), g)
result = g['result']
