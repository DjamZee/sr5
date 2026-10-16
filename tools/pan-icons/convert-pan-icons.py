"""Convert the icons of DjamZ into the generic icons of the crown of a PAN (couronne du PAN, lot 10).

Each source image is a luminous subject on a black ground (PNG 2048 x 2048). For each one:
  1. find the subject: the pixels brighter than `subjectThreshold`, ignoring the `subjectPercentile` % of them
     farthest out on each side (stray sparks, the faint grid of some grounds);
  2. crop a square centred on it, with `margin` of its side all round;
  3. resize it to `size` x `size`;
  4. turn the black ground into transparency: the brightness of a pixel becomes its opacity (x `alphaGain`, below
     `alphaFloor` nothing), and its colour is divided back by that opacity, so that the subject looks the same over the
     dark disc of the crown and keeps the colour of its family;
  5. with `roundCut`, fade the corners out in a circle (`roundFeather` of the side), so that nothing spills out of
     the disc the code draws;
  6. save it as WebP (`quality`) under its category name, in `target`.

The sources are only read. Settings and the file -> category table: pan-icons.json, next to this script.
Run from the root of the system:  python tools/pan-icons/convert-pan-icons.py [--check]
Needs Python 3 and Pillow (with WebP). --check lists what would be written, and writes nothing.
"""
import json
import math
import os
import sys

from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))


def load_settings():
    with open(os.path.join(HERE, "pan-icons.json"), encoding="utf-8") as f:
        return json.load(f)


def brightness(image):
    r, g, b = image.split()
    return ImageChops.lighter(ImageChops.lighter(r, g), b)


def span(profile, total, cut):
    """First and last index of a mass profile, leaving `cut` of the total mass out on each side."""
    low, high, acc = 0, len(profile) - 1, 0.0
    for i, v in enumerate(profile):
        acc += v
        if acc > total * cut:
            low = i
            break
    acc = 0.0
    for i in range(len(profile) - 1, -1, -1):
        acc += profile[i]
        if acc > total * cut:
            high = i
            break
    return low, high


def subject_box(image, threshold, percentile):
    mask = brightness(image).point(lambda v: 255 if v > threshold else 0)
    w, h = mask.size
    cols = list(mask.resize((w, 1), Image.BOX).getdata())
    rows = list(mask.resize((1, h), Image.BOX).getdata())
    total = float(sum(cols))
    if total == 0:
        return 0, 0, w, h
    x0, x1 = span(cols, total, percentile / 100)
    y0, y1 = span(rows, sum(rows), percentile / 100)
    return x0, y0, x1 + 1, y1 + 1


def square_around(box, margin, width, height):
    x0, y0, x1, y1 = box
    side = max(x1 - x0, y1 - y0)
    side = side * (1 + 2 * margin)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    # A crop that goes past the edge is padded with black by Pillow: the ground stays black
    half = side / 2
    return (round(cx - half), round(cy - half), round(cx + half), round(cy + half))


def unscreen(image, gain, floor):
    out = []
    # get_flattened_data from Pillow 12 on, getdata before
    for r, g, b in getattr(image, "get_flattened_data", image.getdata)():
        m = max(r, g, b)
        a = 0 if m <= floor else min(255, round((m - floor) * gain))
        if a == 0:
            out.append((0, 0, 0, 0))
            continue
        k = 255 / a
        out.append((min(255, round(r * k)), min(255, round(g * k)), min(255, round(b * k)), a))
    result = Image.new("RGBA", image.size)
    result.putdata(out)
    return result


def round_cut(image, feather):
    w, h = image.size
    radius = w / 2
    inner = radius * (1 - feather)
    mask = Image.new("L", image.size)
    pixels = mask.load()
    for y in range(h):
        for x in range(w):
            d = math.hypot(x + 0.5 - radius, y + 0.5 - radius)
            if d <= inner:
                pixels[x, y] = 255
            elif d < radius:
                pixels[x, y] = round(255 * (radius - d) / (radius - inner))
    alpha = ImageChops.multiply(image.getchannel("A"), mask)
    image.putalpha(alpha)
    return image


def convert(path, settings):
    source = Image.open(path).convert("RGB")
    box = subject_box(source, settings["subjectThreshold"], settings["subjectPercentile"])
    crop = source.crop(square_around(box, settings["margin"], *source.size))
    size = settings["size"]
    small = crop.resize((size, size), Image.LANCZOS)
    icon = unscreen(small, settings["alphaGain"], settings["alphaFloor"])
    if settings.get("roundCut"):
        icon = round_cut(icon, settings["roundFeather"])
    return icon, box


def main():
    check = "--check" in sys.argv
    settings = load_settings()
    source = settings["source"]
    target = os.path.join(ROOT, settings["target"])
    missing = [name for name in settings["files"] if not os.path.exists(os.path.join(source, name))]
    if missing:
        sys.exit("Missing source images: " + ", ".join(missing))
    total = 0
    for name, category in settings["files"].items():
        out = os.path.join(target, category + ".webp")
        if check:
            print(f"{name} -> {out}")
            continue
        icon, box = convert(os.path.join(source, name), settings)
        icon.save(out, "WEBP", quality=settings["quality"], method=6)
        weight = os.path.getsize(out)
        total += weight
        print(f"{category:15} {weight / 1024:6.1f} KB  subject {box}")
    if not check:
        print(f"{len(settings['files'])} icons, {total / 1024:.1f} KB in all")


if __name__ == "__main__":
    main()
