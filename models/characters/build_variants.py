# Makes every variant in human_variants.py (four Blenders at a time) and lays them out on one sheet:
#   python models/characters/build_variants.py [m03 f07 ...]      (needs Pillow; BLENDER names the program if it isn't on the usual path)
# When they're made it runs tools/bake_humans.mjs --source (node): the checks the bake makes of them (docs/models.md "Human bodies"), so a body that
# breaks them is known of here, before it's committed.
# Writes human/variants/<id>.glb for each (kept in the repo) and its copy assets/models/humans/<id>.glb (what the game loads: tools/bake_humans.mjs makes
# that copy where there's no Blender), js/humandata.ts, human/variants/index.json (id, sex, name, height, the scale to give the
# figure in the game, triangles) and human/variants.png. With ids given, only those are remade (the sheet is of whatever is there).
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'human', 'variants'); sys.path.insert(0, HERE)
from human_variants import VARIANTS
BLENDER = os.environ.get('BLENDER', r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe')
ids = sys.argv[1:] or list(VARIANTS)

def make(vid):
    r = subprocess.run([BLENDER, '-b', '-P', os.path.join(HERE, 'build_human.py')], env=dict(os.environ, HUMAN_VARIANT=vid), capture_output=True, text=True)
    ok = ('DONE ' + vid) in r.stdout
    print(vid, 'ok' if ok else 'FAILED\n' + (r.stdout + r.stderr)[-1500:]); return ok
with ThreadPoolExecutor(4) as ex: done = list(ex.map(make, ids))

have = [v for v in VARIANTS if os.path.exists(os.path.join(OUT, v + '.json'))]
index = [json.load(open(os.path.join(OUT, v + '.json'))) for v in have]
json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
# what the game knows of each before its file has loaded (js/humandata.ts: its height's scale, its colours, the fit of the gear on it)
with open(os.path.join(HERE, '..', '..', 'js', 'humandata.ts'), 'w', encoding='utf-8', newline='\n') as f:
    f.write("'use strict';\n// The human models' variants (assets/models/humans/<id>.glb): written by models/characters/build_variants.py, not by hand.\n")
    f.write("// scale: the figure's height over the skeleton's own (1.756 m); skin, hair: colours; fit: the trunk's half-width, front and back\n")
    f.write("// (metres from the spine's line) across the chest, the belt and the pelvis, and the limbs' girth against the base figure's.\n")
    f.write('interface HumanDef { sex: string; name: string; scale: number; hairStyle: string; skin: number; hair: number; fit: { chest: number[]; belt: number[]; pelvis: number[]; delt: number; arm: number; fore: number; thigh: number; calf: number; head_w: number } }\n')
    f.write('const G_HumanData: Record<string, HumanDef> = {\n')
    for e in index: f.write("  %s: { sex: '%s', name: '%s', scale: %s, hairStyle: '%s', skin: 0x%06x, hair: 0x%06x, fit: %s },\n" % (e['id'], e['sex'], e['name'], e['scale'], e['hair'], e['skin'], e['hair_col'], json.dumps(e['fit'])))
    f.write('};\nG.HumanData = G_HumanData;\ninterface GameModules { HumanData: typeof G_HumanData }\n')
# the sheet: a row for the men, a row for the women; each figure standing (to its own height), its head from the front and turned
shown = [e for e in index if os.path.exists(os.path.join(OUT, e['id'] + '_body.png'))]
if shown:
    try: f = ImageFont.truetype('arial.ttf', 20)
    except OSError: f = ImageFont.load_default()
    W, H = 430, 30 + 640 + 215; rows = [[e for e in shown if e['sex'] == s] for s in 'mf']; rows = [r for r in rows if r]
    sheet = Image.new('RGB', (W * max(len(r) for r in rows), H * len(rows)), (40, 44, 50)); d = ImageDraw.Draw(sheet)
    for j, row in enumerate(rows):
        for i, e in enumerate(row):
            x, y = i * W, j * H; p = lambda n: Image.open(os.path.join(OUT, e['id'] + n))
            d.text((x + 8, y + 4), '%s  %s, %.2f m  (%d tris)' % (e['id'], e['name'], e['height'], e['triangles']['total']), fill=(255, 210, 90), font=f)
            sheet.paste(p('_body.png'), (x, y + 30))
            for k, n in enumerate(('_head_0.png', '_head_40.png')): sheet.paste(p(n).resize((215, 215), Image.LANCZOS), (x + k * 215, y + 30 + 640))
    sheet.save(os.path.join(HERE, 'human', 'variants.png')); print('variants.png', sheet.size)
# (the checks the bake makes of them, here and now: docs/models.md "Human bodies")
import subprocess
try: chk = subprocess.run(['node', os.path.join(HERE, '..', '..', 'tools', 'bake_humans.mjs'), '--source']).returncode
except OSError: chk = 0; print('(node not found: the bodies are unchecked till npm run test:models)')
sys.exit(0 if all(done) and not chk else 1)
