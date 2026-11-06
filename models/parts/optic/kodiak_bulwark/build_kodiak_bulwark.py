# Kodiak Bulwark 34mm red dot: a big tube in rubber armour with a sunshade (models/parts/optic/kodiak_bulwark).
#   Blender: exec(open(r'<repo>/models/parts/optic/kodiak_bulwark/build_kodiak_bulwark.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/kodiak_bulwark'})
#   or:      blender -b -P models/parts/optic/kodiak_bulwark/build_kodiak_bulwark.py
# It sets CFG and runs the shared tube red-dot builder (models/parts/optic/tube_kit.py), which writes kodiak_bulwark.glb, kodiak_bulwark.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'R': 0.024, 'L': 0.066, 'ring': True, 'sunshade': 0.010, 'turret_r': 7.0 * 0.001, 'dial_r': 8.0 * 0.001, 'replaces': ['Kodiak Bulwark 34mm red dot']}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'tube_kit.py'), encoding='utf-8').read(), g)
result = g['result']
