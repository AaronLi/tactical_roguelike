# Vantage Halo circle-dot pistol sight: the RMR-family hood, a solar panel on the housing, a side battery tray, a circle-dot (models/parts/optic/vantage_halo_p).
#   Blender: exec(open(r'<repo>/models/parts/optic/vantage_halo_p/build_vantage_halo_p.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/vantage_halo_p'})
#   or:      blender -b -P models/parts/optic/vantage_halo_p/build_vantage_halo_p.py
# It sets CFG and runs the shared pistol-dot builder (models/parts/optic/pistol_kit.py), which writes vantage_halo_p.glb, vantage_halo_p.blend and model.json.
import os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
CFG = {'hood': 'rmr', 'ret': 'cdot', 'solar': True, 'tray': True, 'replaces': ['Vantage Halo circle-dot pistol sight']}
g = {'PART_DIR': HERE, 'CFG': CFG}
exec(open(os.path.join(os.path.dirname(HERE), 'pistol_kit.py'), encoding='utf-8').read(), g)
result = g['result']
