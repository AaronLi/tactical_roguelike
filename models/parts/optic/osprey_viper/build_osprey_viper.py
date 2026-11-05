# Osprey Viper green dot: an open-emitter reflex, its hoop round-topped and leaning well back, a green dot (models/parts/optic/osprey_viper).
#   Blender: exec(open(r'<repo>/models/parts/optic/osprey_viper/build_osprey_viper.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/osprey_viper'})
#   or:      blender -b -P models/parts/optic/osprey_viper/build_osprey_viper.py
# It sets CFG and runs the shared open-emitter builder (models/parts/optic/open_kit.py), which writes osprey_viper.glb, osprey_viper.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'sy': 0.031, 'win': (0.028, 0.021), 'top': 'round', 'lean': 14, 'ret': 'dotG', 'replaces': ['Osprey Viper green dot']}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'open_kit.py'), encoding='utf-8').read(), g)
result = g['result']
