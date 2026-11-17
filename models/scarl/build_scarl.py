# The SCAR-L (game id scarl): the FN SCAR-L STD (Mk 16), a 14" barrel, the STANAG magazine well, in Blender.
#   Blender: exec(open(r'<repo>/models/scarl/build_scarl.py').read(), {'GUN_DIR': r'<repo>/models/scarl'})
#   or:      blender -b -P models/scarl/build_scarl.py
# It sets CFG and runs the shared SCAR builder (models/scar_kit.py), which writes scarl.glb, scarl.blend and model.json.
import os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'variant': 'l'}
g = {'GUN_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'scar_kit.py'), encoding='utf-8').read(), g)
result = g['result']
