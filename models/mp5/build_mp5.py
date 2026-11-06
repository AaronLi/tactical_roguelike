# The HK MP5 (A2: the fixed stock, the SEF trigger group, the slim handguard, the three-lug barrel), modelled in Blender.
#   Blender: exec(open(r'<repo>/models/mp5/build_mp5.py').read(), {'GUN_DIR': r'<repo>/models/mp5'})
#   or:      blender -b --factory-startup -P models/mp5/build_mp5.py
# It sets CFG and runs the shared MP5 builder (models/mp5_kit.py), which writes mp5.glb and mp5.blend.
import os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'sd': False}
g = {'GUN_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'mp5_kit.py'), encoding='utf-8').read(), g)
result = g['result']
