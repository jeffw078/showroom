"""Gera os arquivos usados pelo showroom sem modificar as fotografias originais.
Execute: python scripts/optimize-images.py (requer Pillow).
"""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = ROOT / 'assets' / 'products'

def convert(source, target, width, quality):
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original).convert('RGB')
        image.thumbnail((width, width), Image.Resampling.LANCZOS)
        image.save(target, 'WEBP', quality=quality, method=6)

for source in sorted(PRODUCTS.glob('*.jpg')):
    for width in (1280, 1920):
        convert(source, PRODUCTS / 'optimized' / f'{source.stem}-{width}.webp', width, 82)
    convert(source, PRODUCTS / 'thumbs' / f'{source.stem}.webp', 320, 76)
    print(source.name, flush=True)

for source in sorted((PRODUCTS / 'details').glob('*')):
    if source.suffix.lower() in ('.jpg', '.png'):
        convert(source, PRODUCTS / 'details' / 'optimized' / f'{source.stem}.webp', 1600, 86)
