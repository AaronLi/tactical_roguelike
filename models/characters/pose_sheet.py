# Lays the pose renders build_human.py left in models/characters/human out as one sheet (poses.png), each pose named, the
# triangle counts along the top:  python models/characters/pose_sheet.py   (needs Pillow)
import json, os
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'human'); st = json.load(open(os.path.join(HERE, 'stats.json')))
rows = [('the mesh (rest)', st['wire'])] + [(n, r) for n, r in st['shots']]
w, h = Image.open(rows[0][1][0]).size; cols = 3; per = 4; R = (len(rows) + per - 1) // per
sheet = Image.new('RGB', (w * cols * per, 44 + (h + 26) * R), (40, 44, 50)); d = ImageDraw.Draw(sheet)
try: f = ImageFont.truetype('arial.ttf', 20)
except OSError: f = ImageFont.load_default()
t = st['triangles']; d.text((12, 10), f"triangles: body {t['body']}, head {t['head']}, eyes {t['eyes']}, total {t['total']}  |  {len(st['bones'])} bones  |  views: front three-quarter, side, back", fill=(230, 230, 230), font=f)
for i, (name, files) in enumerate(rows):
    x0 = (i % per) * w * cols; y0 = 44 + (i // per) * (h + 26)
    d.text((x0 + 10, y0 + 2), name, fill=(255, 210, 90), font=f)
    for k, fn in enumerate(files): sheet.paste(Image.open(fn), (x0 + k * w, y0 + 26))
sheet.save(os.path.join(HERE, 'poses.png'))
for _, files in rows:
    for fn in files: os.remove(fn)
print('poses.png', sheet.size)
# the head's side view with the plate it was traced from laid over it (Gray's fig. 1193: 0.544 mm a pixel, the head's middle at 350, 223.5)
prof = os.path.join(HERE, '_profile.png'); plate = os.path.join(HERE, '..', 'ref', 'head_profile.png')
if os.path.exists(prof) and os.path.exists(plate):
    im = Image.open(prof).convert('RGB'); pl = Image.open(plate).convert('RGB'); k = 0.000544 * 800 / 0.30
    pl = pl.resize((round(pl.size[0] * k), round(pl.size[1] * k))); lay = Image.new('RGB', im.size, (255, 255, 255)); lay.paste(pl, (round(400 - 350 * k), round(400 - 223.5 * k)))
    both = Image.new('RGB', (1600, 800)); both.paste(im, (0, 0)); both.paste(Image.blend(im, lay, 0.45), (800, 0)); both.save(os.path.join(HERE, 'head_profile.png')); os.remove(prof)
