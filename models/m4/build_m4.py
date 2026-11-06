# The M4 carbine, modelled as the Mk 18 Mod 1 (a 10.3" barrel, a 9.5" quad rail, flip-up sights, a SOPMOD-pattern stock), in Blender.
#   Blender: exec(open(r'<repo>/models/m4/build_m4.py').read(), {'GUN_DIR': r'<repo>/models/m4'})
#   or:      blender -b -P models/m4/build_m4.py
# It sets CFG and runs the shared AR builder (models/ar_kit.py), which writes m4.glb and m4.blend.
import os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {}
g = {'GUN_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'ar_kit.py'), encoding='utf-8').read(), g)
result = g['result']
