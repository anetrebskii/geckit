import base64
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
V1 = os.path.join(HERE, "..", "svg")
WORK = os.path.join(HERE, "work")
os.makedirs(WORK, exist_ok=True)
F = "Avenir Next"
INK, SUB, LINE = "#0B1510", "#4A524D", "#E2E5E1"
SL, SD = "#FFFFFF", "#1A1D21"


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    a, b = lum(a), lum(b)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def inner(path):
    s = open(path).read()
    vb = re.search(r'viewBox="([^"]+)"', s).group(1)
    body = re.sub(r"^.*?<svg[^>]*>", "", s, flags=re.S)
    body = re.sub(r"</svg>\s*$", "", body)
    body = re.sub(r"<metadata.*?</metadata>|<sodipodi:namedview[^>]*/>|<defs[^>]*/>|<title>.*?</title>", "", body, flags=re.S)
    return vb, body


def place(path, x, y, w, h):
    vb, body = inner(path)
    return f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{vb}">{body}</svg>'


def text(x, y, s, size, color=INK, weight=500, anchor="start"):
    s = s.replace("&", "&amp;")
    return (f'<text x="{x}" y="{y}" font-family="{F}" font-size="{size}" font-weight="{weight}" '
            f'fill="{color}" text-anchor="{anchor}">{s}</text>')


def card(x, y, w, h, fill="#FFFFFF", stroke=LINE):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="{fill}" stroke="{stroke}"/>'


def pixels(src, size, bg, scale, name):
    raw = os.path.join(WORK, f"{name}-{size}.png")
    subprocess.run(["rsvg-convert", "-w", str(size), "-b", bg, "-o", raw, src], check=True)
    big = os.path.join(WORK, f"{name}-{size}-x{scale}.png")
    subprocess.run(["magick", raw, "-filter", "point", "-resize", f"{scale * 100}%", big], check=True)
    return "data:image/png;base64," + base64.b64encode(open(big, "rb").read()).decode()


def img(uri, x, y, w, h):
    return f'<image x="{x}" y="{y}" width="{w}" height="{h}" href="{uri}" style="image-rendering:pixelated"/>'


MARK = os.path.join(HERE, "tick-tail.svg")
SMALL = os.path.join(HERE, "tick-tail-16.svg")
OLD = os.path.join(V1, "c-symbol.svg")


def slack(x, y, w, dark):
    bg = SD if dark else SL
    ink = "#D1D2D3" if dark else "#1D1C1D"
    sub = "#9A9B9E" if dark else "#616061"
    edge = "#2C2F33" if dark else "#E3E3E3"
    hl = "#27242C" if dark else "#F8F8F8"
    o = [f'<rect x="{x}" y="{y}" width="{w}" height="250" rx="12" fill="{bg}" stroke="{edge}"/>']
    o.append(text(x + 16, y + 26, "36 pt, message", 11, sub, 600))
    o.append(place(MARK, x + 16, y + 38, 36, 36))
    o.append(text(x + 64, y + 54, "GeckIt", 15, ink, 700))
    o.append(f'<rect x="{x+118}" y="{y+42}" width="30" height="15" rx="3" fill="{edge}"/>')
    o.append(text(x + 133, y + 53.5, "APP", 9, sub, 700, "middle"))
    o.append(text(x + 156, y + 54, "9:41 AM", 12, sub))
    o.append(text(x + 64, y + 74, "Done. The board deck is in #leadership.", 14, ink, 400))
    o.append(text(x + 16, y + 112, "24 pt, thread reply", 11, sub, 600))
    o.append(place(MARK, x + 16, y + 122, 24, 24))
    o.append(text(x + 50, y + 139, "GeckIt", 14, ink, 700))
    o.append(text(x + 104, y + 139, "Investor update drafted, ready for review.", 13, ink, 400))
    o.append(text(x + 16, y + 180, "16 pt, sidebar (16 px cut)", 11, sub, 600))
    o.append(f'<rect x="{x+8}" y="{y+192}" width="{w-16}" height="28" rx="6" fill="{hl}"/>')
    o.append(place(SMALL, x + 20, y + 198, 16, 16))
    o.append(text(x + 46, y + 211, "GeckIt", 14, ink, 600))
    o.append(place(MARK, x + 140, y + 198, 16, 16))
    o.append(text(x + 166, y + 211, "full mark at 16", 12, sub, 400))
    return "".join(o)


W = 1800
parts = [f'<rect width="{W}" height="1500" fill="#F2F3F1"/>']
parts.append(text(48, 66, "GeckIt  C Tick Tail, round 2", 36, INK, 700))
parts.append(text(48, 102, "The check is the job done; one quick brush stroke flicks up and rolls into a gecko tail. Sketch for review, not a final asset.", 18, SUB, 400))

y = 136
parts.append(card(24, y, W - 48, 330))
cols = [
    (OLD, "Round 1", "Hook reads as '?'"),
    (MARK, "Round 2", "Tapered flick, real spiral"),
    (os.path.join(HERE, "tick-tail-mark.svg"), "One colour", "Black on white"),
    (None, "Reversed", "White on ink"),
    (SMALL, "16 px cut", "Heavier, spiral to a hook"),
]
for i, (src, title, note) in enumerate(cols):
    cx = 56 + i * 344
    if src is None:
        parts.append(f'<rect x="{cx}" y="{y+28}" width="220" height="220" rx="50" fill="{INK}"/>')
        vb, body = inner(os.path.join(HERE, "tick-tail-mark.svg"))
        parts.append(f'<svg x="{cx}" y="{y+28}" width="220" height="220" viewBox="{vb}"><g style="fill:#FFFFFF" fill="#FFFFFF">{body.replace("#000", "#FFFFFF")}</g></svg>')
    elif "mark" in src:
        parts.append(f'<rect x="{cx}" y="{y+28}" width="220" height="220" rx="50" fill="#FFFFFF" stroke="{LINE}"/>')
        parts.append(place(src, cx, y + 28, 220, 220))
    else:
        parts.append(place(src, cx, y + 28, 220, 220))
    parts.append(text(cx, y + 282, title, 20, INK, 700))
    parts.append(text(cx, y + 308, note, 15, SUB, 400))
    if i == 0:
        parts.append(text(cx + 268, y + 150, "→", 40, "#9AA39D", 500, "middle"))

y = 490
parts.append(card(24, y, 1080, 300))
parts.append(text(56, y + 40, "Lockup", 20, INK, 700))
parts.append(card(56, y + 60, 500, 150, "#FFFFFF"))
parts.append(place(os.path.join(HERE, "tick-tail-lockup-light.svg"), 86, y + 84, 350 * 420 / 420, 100))
parts.append(f'<rect x="572" y="{y+60}" width="500" height="150" rx="16" fill="{SD}"/>')
parts.append(place(os.path.join(HERE, "tick-tail-lockup-dark.svg"), 602, y + 84, 350, 100))
parts.append(text(56, y + 240, "I/l fix: the capital I gets slab serifs, so it cannot be read as a lowercase l.", 15, INK, 600))
parts.append(place(os.path.join(V1, "c-lockup-light.svg"), 56, y + 250, 140, 42))
parts.append(text(206, y + 278, "round 1: 'Geckl t'?", 14, SUB, 400))
parts.append(place(os.path.join(HERE, "tick-tail-lockup-light.svg"), 400, y + 250, 147, 42))
parts.append(text(556, y + 278, "round 2: GeckIt", 14, SUB, 400))

parts.append(card(1124, y, W - 1148, 300))
parts.append(text(1156, y + 40, "Contrast (WCAG, graphics need 3:1)", 20, INK, 700))
rows = [
    ("White mark on tile #138A3E", ratio("#FFFFFF", "#138A3E")),
    ("Tile vs Slack light #FFFFFF", ratio("#138A3E", SL)),
    ("Tile vs Slack dark #1A1D21", ratio("#138A3E", SD)),
    ("Round 1 white on #16A34A", ratio("#FFFFFF", "#16A34A")),
    ("Wordmark #0B1510 on white", ratio(INK, SL)),
    ("Wordmark #F4F7F5 on #1A1D21", ratio("#F4F7F5", SD)),
]
for i, (label, r) in enumerate(rows):
    yy = y + 80 + i * 34
    parts.append(text(1156, yy, label, 15, SUB, 400))
    parts.append(text(W - 64, yy, f"{r:.1f}:1", 15, INK, 700, "end"))
parts.append(text(1156, y + 290, "Tile deepened from #16A34A so the white mark passes 3:1 and stays clear of dark mode.", 12, SUB, 400))

y = 814
parts.append(card(24, y, W - 48, 360))
parts.append(text(56, y + 40, "Slack, light and dark (2x render, as on a Retina screen)", 20, INK, 700))
parts.append(slack(56, y + 60, 560, False))
parts.append(slack(636, y + 60, 560, True))
parts.append(text(1220, y + 84, "True pixels: 16 at 6x, 24 at 4x, 36 at 3x", 15, INK, 700))
for j, (bg, label) in enumerate(((SL, "light"), (SD, "dark"))):
    by = y + 98 + j * 112
    parts.append(img(pixels(MARK, 16, bg, 6, f"full-{label}"), 1220, by, 96, 96))
    parts.append(img(pixels(SMALL, 16, bg, 6, f"cut-{label}"), 1330, by, 96, 96))
    parts.append(img(pixels(MARK, 24, bg, 4, f"full24-{label}"), 1440, by, 96, 96))
    parts.append(img(pixels(MARK, 36, bg, 3, f"full36-{label}"), 1550, by, 108, 108))
parts.append(text(1268, y + 344, "16 full", 12, SUB, 600, "middle"))
parts.append(text(1378, y + 344, "16 cut", 12, SUB, 600, "middle"))
parts.append(text(1488, y + 344, "24", 12, SUB, 600, "middle"))
parts.append(text(1604, y + 344, "36", 12, SUB, 600, "middle"))

y = 1198
parts.append(card(24, y, W - 48, 250))
parts.append(text(56, y + 40, "What changed", 20, INK, 700))
notes = [
    "Done first: the check keeps its plain shape and weight, so 'done' still reads before anything else.",
    "Quickly: the long stroke now tapers like one fast brush flick, from 46 to 31 units, instead of a uniform pipe.",
    "Gecko: the hook became a real tail spiral, about 1.2 turns tightening to a fine tip, the same curl as today's app gecko.",
    "Composition: centred optically, tile deepened to #138A3E for contrast; the wordmark I got slab serifs.",
    "16 px: the spiral closes into a blob, so a separate cut keeps a thick hook with a ball end; from 24 px the full mark works.",
]
for i, n in enumerate(notes):
    parts.append(text(56, y + 80 + i * 32, n, 16, SUB if i else SUB, 400))
H = y + 280

doc = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(parts)}</svg>'.replace('height="1500"', f'height="{H}"', 1)
svg_path = os.path.join(WORK, "review.svg")
open(svg_path, "w").write(doc)
subprocess.run(["rsvg-convert", "-z", "2", "-o", os.path.join(HERE, "geckit-tick-tail-review.png"), svg_path], check=True)
print("ok")
