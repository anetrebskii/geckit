import base64
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "svg")
WORK = os.path.join(HERE, "work")
os.makedirs(WORK, exist_ok=True)
F = "Avenir Next"
INK, SUB, LINE = "#0B0D10", "#50555C", "#E3E5E8"
SL, SD = "#FFFFFF", "#1A1D21"

CONCEPTS = [
    ("a", "A", "Breakout", "#0E1116", "#C8F135",
     "Cut out of a box, the tick leaves through its corner.",
     "Speed: done before the box even closes; figure and ground swap."),
    ("b", "B", "Stride", "#1F4BFF", "#FFFFFF",
     "The first short step stays behind; the long stroke has already moved on.",
     "Speed: a gap in the stroke, like a fast pen lifting off."),
    ("c", "C", "Wedge", "#FF5A1F", "#FFFFFF",
     "The long stroke widens as it rises and is sliced by two speed cuts.",
     "Speed: the stroke accelerates, thin at the turn and broad at the end."),
]
RECOMMEND = "a"


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    a, b = lum(a), lum(b)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


uid = [0]


def place(path, x, y, w, h):
    s = open(path).read()
    vb = re.search(r'viewBox="([^"]+)"', s).group(1)
    body = re.sub(r"^.*?<svg[^>]*>", "", s, flags=re.S)
    body = re.sub(r"</svg>\s*$", "", body)
    body = re.sub(r"<metadata.*?</metadata>|<sodipodi:namedview[^>]*/>|<title>.*?</title>", "", body, flags=re.S)
    uid[0] += 1
    p = f"u{uid[0]}"
    body = re.sub(r'id="([^"]+)"', lambda m: f'id="{p}{m.group(1)}"', body)
    body = re.sub(r"url\(#([^)]+)\)", lambda m: f"url(#{p}{m.group(1)})", body)
    return f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{vb}">{body}</svg>'


def text(x, y, s, size, color=INK, weight=500, anchor="start"):
    s = s.replace("&", "&amp;")
    return (f'<text x="{x}" y="{y}" font-family="{F}" font-size="{size}" font-weight="{weight}" '
            f'fill="{color}" text-anchor="{anchor}">{s}</text>')


def pixels(src, size, bg, scale):
    raw = os.path.join(WORK, f"px-{uid[0]}-{size}.png")
    uid[0] += 1
    subprocess.run(["rsvg-convert", "-w", str(size), "-b", bg, "-o", raw, src], check=True)
    big = raw.replace(".png", "-big.png")
    subprocess.run(["magick", raw, "-filter", "point", "-resize", f"{scale * 100}%", big], check=True)
    uri = "data:image/png;base64," + base64.b64encode(open(big, "rb").read()).decode()
    return uri


def slack(key, x, y, w, dark):
    bg = SD if dark else SL
    ink = "#D1D2D3" if dark else "#1D1C1D"
    sub = "#9A9B9E" if dark else "#616061"
    edge = "#2C2F33" if dark else "#E3E3E3"
    sym = os.path.join(SVG, f"{key}-symbol.svg")
    o = [f'<rect x="{x}" y="{y}" width="{w}" height="150" rx="12" fill="{bg}" stroke="{edge}"/>']
    o.append(place(sym, x + 14, y + 14, 36, 36))
    o.append(text(x + 62, y + 30, "GeckIt", 15, ink, 700))
    o.append(f'<rect x="{x+116}" y="{y+18}" width="30" height="15" rx="3" fill="{edge}"/>')
    o.append(text(x + 131, y + 29.5, "APP", 9, sub, 700, "middle"))
    o.append(text(x + 62, y + 50, "Done. The board deck is in #leadership.", 14, ink, 400))
    o.append(place(sym, x + 14, y + 66, 24, 24))
    o.append(text(x + 48, y + 83, "GeckIt replied: investor update drafted.", 13, ink, 400))
    o.append(place(sym, x + 18, y + 112, 16, 16))
    o.append(text(x + 44, y + 125, "GeckIt", 14, ink, 600))
    o.append(text(x + w - 14, y + 125, "36 / 24 / 16 pt", 11, sub, 600, "end"))
    return "".join(o)


W, ROW, TOP = 2000, 420, 150
H = TOP + ROW * 3 + 90
parts = [f'<rect width="{W}" height="{H}" fill="#F3F4F5"/>']
parts.append(text(48, 66, "GeckIt logo, round 3: the tick, from scratch", 36, INK, 700))
parts.append(text(48, 104, "Three new tick geometries for an AI employee in Slack. 'GeckIt' = do it, but quickly. No gecko, no curl, no ball ends. Sketches for choosing.", 18, SUB, 400))

for i, (key, letter, name, tile, fg, idea, speed) in enumerate(CONCEPTS):
    y = TOP + i * ROW
    rec = key == RECOMMEND
    parts.append(f'<rect x="24" y="{y}" width="{W-48}" height="{ROW-24}" rx="18" fill="#FFFFFF" '
                 f'stroke="{"#111318" if rec else LINE}" stroke-width="{3 if rec else 1}"/>')
    parts.append(place(os.path.join(SVG, f"{key}-symbol.svg"), 52, y + 28, 200, 200))
    parts.append(text(52, y + 272, f"{letter}  {name}", 28, INK, 700))
    if rec:
        parts.append(f'<rect x="52" y="{y+290}" width="170" height="28" rx="14" fill="#111318"/>')
        parts.append(text(137, y + 309, "Recommended", 15, "#C8F135", 700, "middle"))
    parts.append(text(52, y + 346, idea, 15, INK, 600))
    parts.append(text(52, y + 370, speed, 15, SUB, 400))

    parts.append(f'<rect x="290" y="{y+28}" width="150" height="150" rx="12" fill="#FFFFFF" stroke="{LINE}"/>')
    parts.append(place(os.path.join(SVG, f"{key}-mark-black.svg"), 300, y + 38, 130, 130))
    parts.append(f'<rect x="452" y="{y+28}" width="150" height="150" rx="12" fill="#000000"/>')
    parts.append(place(os.path.join(SVG, f"{key}-mark-white.svg"), 462, y + 38, 130, 130))
    parts.append(text(365, y + 200, "mono", 12, SUB, 600, "middle"))
    parts.append(text(527, y + 200, "reversed", 12, SUB, 600, "middle"))

    parts.append(f'<rect x="626" y="{y+28}" width="430" height="150" rx="14" fill="#FFFFFF" stroke="{LINE}"/>')
    parts.append(place(os.path.join(SVG, f"{key}-lockup-light.svg"), 656, y + 58, 344, 96))
    parts.append(f'<rect x="1070" y="{y+28}" width="430" height="150" rx="14" fill="{SD}"/>')
    parts.append(place(os.path.join(SVG, f"{key}-lockup-dark.svg"), 1100, y + 58, 344, 96))

    parts.append(slack(key, 626, y + 200, 430, False))
    parts.append(slack(key, 1070, y + 200, 430, True))

    sym = os.path.join(SVG, f"{key}-symbol.svg")
    blk = os.path.join(SVG, f"{key}-mark-black.svg")
    parts.append(text(1524, y + 46, "True pixels, zoomed", 14, INK, 700))
    cells = [(sym, 16, SL, 6, "16"), (sym, 24, SL, 4, "24"), (sym, 36, SL, 3, "36"),
             (sym, 16, SD, 6, "16 dark"), (blk, 16, SL, 6, "16 mono"), (sym, 36, SD, 3, "36 dark")]
    for j, (src, size, bg, sc, lab) in enumerate(cells):
        cx = 1524 + (j % 3) * 146
        cy = y + 62 + (j // 3) * 150
        parts.append(f'<image x="{cx}" y="{cy}" width="{size*sc}" height="{size*sc}" href="{pixels(src, size, bg, sc)}" style="image-rendering:pixelated"/>')
        parts.append(text(cx + 54, cy + 126, lab, 11, SUB, 600, "middle"))
    parts.append(text(1524, y + 372, f"Contrast: mark/tile {ratio(fg, tile):.1f}  tile/light {ratio(tile, SL):.1f}  tile/dark {ratio(tile, SD):.1f}  mark/dark {ratio(fg, SD):.1f}", 12, SUB, 500))

parts.append(text(48, H - 40, "Colours are placeholders for direction, not a palette. Wordmark: Avenir Next with a drawn slab-serif I (I/l fix), outlined; C is slanted 10 degrees. No trademark search done.", 15, SUB, 400))

doc = f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(parts)}</svg>'
svg_path = os.path.join(WORK, "round-3.svg")
open(svg_path, "w").write(doc)
subprocess.run(["rsvg-convert", "-z", "2", "-o", os.path.join(HERE, "geckit-logo-round-3.png"), svg_path], check=True)
print("ok")
