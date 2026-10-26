import os, datetime, glob
from PIL import Image, ImageOps
now = datetime.datetime.now()
work_path = os.path.join(os.getcwd(), 'converted', now.date().isoformat(), f'{now.hour}_{now.minute}')
os.makedirs(work_path)

for image_path in glob.iglob('*.png'):
    filename = os.path.basename(image_path)
    image = Image.open(image_path)
    image = ImageOps.scale(image, factor = 0.25, resample = Image.Resampling.NEAREST)
    image = image.convert('P', palette=Image.Palette.ADAPTIVE, colors=256)
    image.save(os.path.join(work_path, filename))