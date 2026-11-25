import os, sys
from fontTools.ttLib import TTCollection, TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

FACES = {
    "charter-black": ("/System/Library/Fonts/Supplemental/Charter.ttc", 5),
    "charter-bold": ("/System/Library/Fonts/Supplemental/Charter.ttc", 3),
    "galvji-bold": ("/System/Library/Fonts/Supplemental/Galvji.ttc", 1),
    "avenir-bold": ("/System/Library/Fonts/Avenir Next.ttc", 0),
    "gill-bold": ("/System/Library/Fonts/Supplemental/GillSans.ttc", 1),
    "athelas-bold": ("/System/Library/Fonts/Supplemental/Athelas.ttc", 3),
    "xcharter-bold": (os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts", "XCharter-Bold.otf"), None),
}
_cache = {}


def font(face):
    if face not in _cache:
        p, i = FACES[face]
        _cache[face] = TTFont(p) if i is None else TTCollection(p).fonts[i]
    return _cache[face]


def glyph(face, ch):
    f = font(face)
    gs = f.getGlyphSet()
    name = f.getBestCmap()[ord(ch)]
    pen = SVGPathPen(gs)
    gs[name].draw(pen)
    b = BoundsPen(gs)
    gs[name].draw(b)
    return pen.getCommands(), gs[name].width, b.bounds


def word(face, text, size, x, y, fill, track=None, colors=None):
    f = font(face)
    upm = f["head"].unitsPerEm
    s = size / upm
    out, cx = [], 0
    track = track or {}
    for i, ch in enumerate(text):
        d, adv, _ = glyph(face, ch)
        col = (colors or {}).get(i, fill)
        out.append(f'<path transform="translate({x + cx * s:.2f} {y}) scale({s:.5f} {-s:.5f})" d="{d}" fill="{col}"/>')
        cx += adv + track.get(i, 0)
    return "".join(out), cx * s


def caps(face):
    f = font(face)
    return f["OS/2"].sCapHeight / f["head"].unitsPerEm
