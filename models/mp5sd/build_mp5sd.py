# The HK MP5SD (the MP5's receiver, trigger group, grip and A2 stock with its integral suppressor: the ribbed handguard round the can's rear,
# the front sight on its collar, the smooth tube on to the muzzle), modelled in Blender.
#   Blender: exec(open(r'<repo>/models/mp5sd/build_mp5sd.py').read(), {'GUN_DIR': r'<repo>/models/mp5sd'})
#   or:      blender -b --factory-startup -P models/mp5sd/build_mp5sd.py
# It sets CFG and runs the shared MP5 builder (models/mp5_kit.py), which writes mp5sd.glb and mp5sd.blend, and the gun's two other
# barrels beside it (variants, docs/models.md): barrel_long.glb (the extended can) and barrel_open.glb (the unsuppressed conversion).
import os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'sd': True}
g = {'GUN_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'mp5_kit.py'), encoding='utf-8').read(), g)
result = g['result']
