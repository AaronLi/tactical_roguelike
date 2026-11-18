# The SCAR-H (game id scar): the FN SCAR-H STD (Mk 17), a 16" barrel, the 20-round 7.62 x 51 magazine, in Blender.
#   Blender: exec(open(r'<repo>/models/scar/build_scar.py').read(), {'GUN_DIR': r'<repo>/models/scar'})
#   or:      blender -b -P models/scar/build_scar.py
# It sets CFG and runs the shared SCAR builder (models/scar_kit.py), which writes scar.glb, scar.blend and model.json.
import os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'variant': 'h'}
g = {'GUN_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'scar_kit.py'), encoding='utf-8').read(), g)
result = g['result']
