import base64
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "svg")
WORK = os.path.join(HERE, "work")
os.makedirs(WORK, exist_ok=True)
F = "Avenir Next"
INK, SUB, LINE = "#111418", "#555B63", "#E3E5E8"
SL, SD = "#FFFFFF", "#1A1D21"
LIME, GRAPHITE, RIM = "#C8F135", "#1E2329", "#343B45"
MAIN = os.path.join(SVG, "breakout.svg")
SMALL = os.path.join(SVG, "breakout-16.svg")
MONO = os.path.join(SVG, "breakout-mono-black.svg")
MONO16 = os.path.join(SVG, "breakout-16-mono-black.svg")


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    a, b = lum(a), lum(b)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


n = [0]


def place(path, x, y, w, h):
    s = open(path).read()
    vb = re.search(r'viewBox="([^"]+)"', s).group(1)
    body = re.sub(r"^.*?<svg[^>]*>", "", s, flags=re.S)
    body = re.sub(r"</svg>\s*$", "", body)
    body = re.sub(r"<metadata.*?</metadata>|<sodipodi:namedview[^>]*/>|<title>.*?</title>", "", body, flags=re.S)
    return f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{vb}">{body}</svg>'


def text(x, y, s, size, color=INK, weight=500, anchor="start"):
    s = s.replace("&", "&amp;")
    return (f'<text x="{x}" y="{y}" font-family="{F}" font-size="{size}" font-weight="{weight}" '
            f'fill="{color}" text-anchor="{anchor}">{s}</text>')


def pixels(src, size, bg, scale, x, y, label):
    n[0] += 1
    raw = os.path.join(WORK, f"px{n[0]}.png")
    subprocess.run(["rsvg-convert", "-w", str(size), "-b", bg, "-o", raw, src], check=True)
    big = os.path.join(WORK, f"px{n[0]}-big.png")
    subprocess.run(["magick", raw, "-filter", "point", "-resize", f"{scale * 100}%", big], check=True)
    uri = "data:image/png;base64," + base64.b64encode(open(big, "rb").read()).decode()
    side = size * scale
    return (f'<image x="{x}" y="{y}" width="{side}" height="{side}" href="{uri}" style="image-rendering:pixelated"/>'
            + text(x + side / 2, y + side + 20, label, 12, SUB, 600, "middle"))


def slack(x, y, w, dark):
    bg = SD if dark else SL
    ink = "#D1D2D3" if dark else "#1D1C1D"
    sub = "#9A9B9E" if dark else "#616061"
    edge = "#2C2F33" if dark else "#E3E3E3"
    hl = "#27242C" if dark else "#F6F6F6"
    o = [f'<rect x="{x}" y="{y}" width="{w}" height="232" rx="12" fill="{bg}" stroke="{edge}"/>']
    o.append(text(x + 16, y + 26, "Slack " + ("dark" if dark else "light") + ", real size", 12, sub, 700))
    o.append(place(MAIN, x + 16, y + 42, 36, 36))
    o.append(text(x + 64, y + 58, "GeckIt", 15, ink, 700))
    o.append(f'<rect x="{x+118}" y="{y+46}" width="30" height="15" rx="3" fill="{edge}"/>')
    o.append(text(x + 133, y + 57.5, "APP", 9, sub, 700, "middle"))
    o.append(text(x + 156, y + 58, "9:41 AM", 12, sub))
    o.append(text(x + 64, y + 78, "Done. The board deck is in #leadership.", 14, ink, 400))
    o.append(text(x + w - 16, y + 58, "36", 11, sub, 700, "end"))
    o.append(place(MAIN, x + 16, y + 108, 24, 24))
    o.append(text(x + 50, y + 125, "GeckIt", 14, ink, 700))
    o.append(text(x + 104, y + 125, "Investor update drafted.", 13, ink, 400))
    o.append(text(x + w - 16, y + 125, "24", 11, sub, 700, "end"))
    o.append(f'<rect x="{x+8}" y="{y+160}" width="{w-16}" height="30" rx="6" fill="{hl}"/>')
    o.append(place(SMALL, x + 20, y + 167, 16, 16))
    o.append(text(x + 46, y + 180, "GeckIt", 14, ink, 600))
    o.append(text(x + w - 16, y + 180, "16, sidebar", 11, sub, 700, "end"))
    o.append(text(x + 16, y + 216, "16 uses the 16 px cut; 24 and 36 use the main mark.", 11, sub, 500))
    return "".join(o)


W = 1800
P = [f'<rect width="{W}" height="1300" fill="#F3F4F5"/>']
P.append(text(48, 64, "GeckIt  Breakout, review candidate", 34, INK, 700))
P.append(text(48, 98, "The tick is cut out of a leaning box and leaves through its corner: the job is done before the box even closes.", 18, SUB, 400))

y = 128
P.append(f'<rect x="24" y="{y}" width="{W-48}" height="420" rx="18" fill="#FFFFFF" stroke="{LINE}"/>')
P.append(place(MAIN, 56, y + 32, 300, 300))
P.append(text(56, y + 372, "Main mark", 18, INK, 700))
P.append(text(56, y + 396, "graphite tile, lime box, one path", 14, SUB, 400))
P.append(f'<rect x="392" y="{y+32}" width="200" height="200" rx="16" fill="#FFFFFF" stroke="{LINE}"/>')
P.append(place(MONO, 402, y + 42, 180, 180))
P.append(f'<rect x="612" y="{y+32}" width="200" height="200" rx="16" fill="#000000"/>')
P.append(place(os.path.join(SVG, "breakout-mono-white.svg"), 622, y + 42, 180, 180))
P.append(text(392, y + 258, "One colour", 18, INK, 700))
P.append(text(392, y + 282, "black and reversed; the tick swaps figure and ground", 14, SUB, 400))
P.append(place(SMALL, 392, y + 300, 96, 96))
P.append(f'<rect x="508" y="{y+300}" width="96" height="96" rx="14" fill="#FFFFFF" stroke="{LINE}"/>')
P.append(place(MONO16, 512, y + 304, 88, 88))
P.append(text(620, y + 340, "16 px cut", 18, INK, 700))
P.append(text(620, y + 364, "tick 40 vs 34, longer short arm,", 14, SUB, 400))
P.append(text(620, y + 384, "shorter exit, box larger in the tile", 14, SUB, 400))
P.append(f'<rect x="852" y="{y+32}" width="900" height="170" rx="16" fill="#FFFFFF" stroke="{LINE}"/>')
P.append(place(os.path.join(SVG, "breakout-lockup-light.svg"), 902, y + 62, 394, 112))
P.append(f'<rect x="852" y="{y+218}" width="900" height="170" rx="16" fill="{SD}"/>')
P.append(place(os.path.join(SVG, "breakout-lockup-dark.svg"), 902, y + 248, 394, 112))
P.append(text(1360, y + 124, "GeckIt: slab-serif I, so it is never 'Geckl t'", 14, SUB, 500))

y = 572
P.append(f'<rect x="24" y="{y}" width="{W-48}" height="300" rx="18" fill="#FFFFFF" stroke="{LINE}"/>')
P.append(slack(48, y + 34, 470, False))
P.append(slack(534, y + 34, 470, True))
P.append(text(1030, y + 52, "True pixels, zoomed", 15, INK, 700))
cells = [
    (MAIN, 16, SL, 6, "16 main"), (SMALL, 16, SL, 6, "16 cut"), (SMALL, 16, SD, 6, "16 cut dark"), (MONO16, 16, SL, 6, "16 mono"),
    (MAIN, 24, SD, 4, "24 dark"), (MAIN, 36, SD, 3, "36 dark"),
]
for j, (src, size, bg, sc, lab) in enumerate(cells[:4]):
    P.append(pixels(src, size, bg, sc, 1030 + j * 118, y + 70, lab))
for j, (src, size, bg, sc, lab) in enumerate(cells[4:]):
    P.append(pixels(src, size, bg, sc, 1504 + j * 124, y + 70, lab))
P.append(text(1030, y + 228, "At 16 the cut keeps a clear V and a separate nub at the corner,", 13, SUB, 500))
P.append(text(1030, y + 248, "in colour and in one colour; 24 and 36 use the main mark.", 13, SUB, 500))

y = 896
P.append(f'<rect x="24" y="{y}" width="880" height="300" rx="18" fill="#FFFFFF" stroke="{LINE}"/>')
P.append(text(56, y + 42, "What changed since round 3", 20, INK, 700))
notes = [
    "One flat path: box and tick combined by even-odd, so no seams at the corner.",
    "The tick's centre line runs exactly through the corner; no slivers beside the exit.",
    "Clear margins inside the box, so the tick never touches an edge.",
    "Tile lifted to #1E2329 with a #343B45 rim, so the avatar keeps its shape in dark Slack.",
    "A separate 16 px cut: longer short arm so the V survives, for sidebars and favicons.",
]
for i, t in enumerate(notes):
    P.append(text(56, y + 84 + i * 36, t, 15, SUB, 400))
P.append(f'<rect x="924" y="{y}" width="852" height="300" rx="18" fill="#FFFFFF" stroke="{LINE}"/>')
P.append(text(956, y + 42, "Contrast (graphics need 3:1)", 20, INK, 700))
rows = [
    ("Lime box on graphite tile", ratio(LIME, GRAPHITE)),
    ("Graphite tile on Slack light", ratio(GRAPHITE, SL)),
    ("Lime box on Slack dark", ratio(LIME, SD)),
    ("Tile rim on Slack dark (shape cue only)", ratio(RIM, SD)),
    ("Graphite tile on Slack dark", ratio(GRAPHITE, SD)),
]
for i, (lab, r) in enumerate(rows):
    P.append(text(956, y + 84 + i * 36, lab, 15, SUB, 400))
    P.append(text(1740, y + 84 + i * 36, f"{r:.1f}:1", 15, INK, 700, "end"))
P.append(text(956, y + 276, "In dark Slack the lime box carries the avatar; the tile only gives its outline.", 13, SUB, 500))
H = y + 330
P[0] = f'<rect width="{W}" height="{H}" fill="#F3F4F5"/>'

doc = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(P)}</svg>'
path = os.path.join(WORK, "review.svg")
open(path, "w").write(doc)
subprocess.run(["rsvg-convert", "-z", "2", "-o", os.path.join(HERE, "geckit-breakout-review.png"), path], check=True)
print("ok")
