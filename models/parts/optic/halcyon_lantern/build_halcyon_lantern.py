# Halcyon Lantern holographic: a round-topped hood, a battery tube across the base's front, buttons on the back (models/parts/optic/halcyon_lantern).
#   Blender: exec(open(r'<repo>/models/parts/optic/halcyon_lantern/build_halcyon_lantern.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/halcyon_lantern'})
#   or:      blender -b -P models/parts/optic/halcyon_lantern/build_halcyon_lantern.py
# It sets CFG and runs the shared holographic builder (models/parts/optic/holo_kit.py), which writes halcyon_lantern.glb, halcyon_lantern.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'battery': 'cross', 'buttons': 'rear', 'hood': 'round', 'replaces': ['Halcyon Lantern holographic']}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'holo_kit.py'), encoding='utf-8').read(), g)
result = g['result']
