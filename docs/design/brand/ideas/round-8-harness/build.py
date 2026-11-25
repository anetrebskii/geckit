import base64
import math
import os
import re
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OG = os.path.join(HERE, "..", "offset-green", "svg", "offset-green.svg")
SVG = os.path.join(HERE, "svg")
WORK = os.path.join(HERE, "work")
os.makedirs(SVG, exist_ok=True)
os.makedirs(WORK, exist_ok=True)
F = "Avenir Next"
G, GR, WT = "#16191D", "#4AC85C", "#FFFFFF"
INK, SUB, LINE, BG = "#111418", "#555B63", "#E3E5E8", "#F3F4F5"
SL, SD = "#FFFFFF", "#1A1D21"


def rr(x, y, w, h, r, shear=0.0):
    k = math.tan(math.radians(shear))
    cy = y + h / 2
    pts = []
    for cx, cyy, a0 in ((x + w - r, y + r, -90), (x + w - r, y + h - r, 0), (x + r, y + h - r, 90), (x + r, y + r, 180)):
        for i in range(0, 91, 10):
            a = math.radians(a0 + i)
            px, py = cx + r * math.cos(a), cyy + r * math.sin(a)
            pts.append((px + k * (cy - py), py))
    return "M" + " L".join(f"{px:.2f} {py:.2f}" for px, py in pts) + " Z"


def caret(a, b):
    return (f'<path fill="{a}" d="{rr(64, 52, 30, 152, 15)}"/>'
            f'<path fill="{b}" d="{rr(112, 104, 104, 48, 16, shear=22)}"/>')


def gee(a, b):
    still = " ".join([rr(52, 52, 140, 36, 14), rr(52, 52, 36, 152, 14), rr(52, 168, 140, 36, 14), rr(156, 150, 36, 54, 14)])
    return f'<path fill="{a}" d="{still}"/><path fill="{b}" d="{rr(120, 108, 100, 34, 13, shear=22)}"/>'


def frame(a, b):
    still = " ".join([rr(48, 48, 32, 160, 14), rr(48, 48, 86, 32, 14), rr(48, 176, 86, 32, 14)])
    return f'<path fill="{a}" d="{still}"/><path fill="{b}" d="{rr(104, 104, 120, 48, 16, shear=22)}"/>'


def svg(body, w=256, h=256, title=None):
    t = f"<title>{title}</title>" if title else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{t}{body}</svg>'


def tile(art):
    return f'<rect width="256" height="256" rx="58" fill="{G}"/><g transform="translate(128 128) scale(0.92) translate(-128 -128)">{art}</g>'


MARKS = {"caret": caret, "g": gee, "frame": frame}
for k, fn in MARKS.items():
    open(os.path.join(SVG, f"{k}.svg"), "w").write(svg(tile(fn(WT, GR)), title=f"GeckIt round 8, {k}"))
    open(os.path.join(SVG, f"{k}-mono-black.svg"), "w").write(svg(fn("#000000", "#000000"), title=f"GeckIt round 8, {k}, one colour"))
shutil.copy(OG, os.path.join(SVG, "offset-green.svg"))

S = lambda n: os.path.join(SVG, n)
n = [0]


def place(path, x, y, w, h):
    s = open(path).read()
    vb = re.search(r'viewBox="([^"]+)"', s).group(1)
    body = re.sub(r"^.*?<svg[^>]*>", "", s, flags=re.S)
    body = re.sub(r"</svg>\s*$", "", body)
    body = re.sub(r"<title>.*?</title>", "", body, flags=re.S)
    return f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{vb}">{body}</svg>'


def text(x, y, s, size, color=INK, weight=500, anchor="start"):
    return (f'<text x="{x}" y="{y}" font-family="{F}" font-size="{size}" font-weight="{weight}" '
            f'fill="{color}" text-anchor="{anchor}">{s}</text>')


def pixels(src, size, bg, scale, x, y):
    n[0] += 1
    raw = os.path.join(WORK, f"px{n[0]}.png")
    subprocess.run(["rsvg-convert", "-w", str(size), "-b", bg, "-o", raw, src], check=True)
    big = os.path.join(WORK, f"px{n[0]}-big.png")
    subprocess.run(["magick", raw, "-filter", "point", "-resize", f"{scale * 100}%", big], check=True)
    uri = "data:image/png;base64," + base64.b64encode(open(big, "rb").read()).decode()
    return f'<image x="{x}" y="{y}" width="{size*scale}" height="{size*scale}" href="{uri}" style="image-rendering:pixelated"/>'


def avatars(m, x, y, w, dark):
    bg = SD if dark else SL
    ink = "#D1D2D3" if dark else "#1D1C1D"
    edge = "#2C2F33" if dark else "#E3E3E3"
    o = [f'<rect x="{x}" y="{y}" width="{w}" height="64" rx="10" fill="{bg}" stroke="{edge}"/>']
    o.append(place(m, x + 12, y + 14, 36, 36))
    o.append(place(m, x + 60, y + 20, 24, 24))
    o.append(place(m, x + 96, y + 24, 16, 16))
    o.append(text(x + 122, y + 37, "GeckIt", 14, ink, 700))
    return "".join(o)


COLS = [
    ("offset-green", None, "Offset (current)", "Workspace bar, AI bar ahead"),
    ("caret", "caret-mono-black", "1  Caret", "The text cursor; the work leaves it"),
    ("g", "g-mono-black", "2  G of bars", "The name's G; its bar shoots out"),
    ("frame", "frame-mono-black", "3  Frame and agent", "The harness holds; the AI leaves it"),
]
W, CW = 1480, 352
P = [""]
P.append(text(32, 52, "GeckIt round 8: harness, IDE and AI, in the Offset language", 28, INK, 700))
P.append(text(32, 80, "Sketches. Same bars, same 22° lean, app green #4AC85C. Offset is the reference, unchanged.", 15, SUB, 400))
for i, (k, mono, name, note) in enumerate(COLS):
    x = 24 + i * (CW + 8)
    y = 100
    strong = i in (2,)
    P.append(f'<rect x="{x}" y="{y}" width="{CW}" height="610" rx="18" fill="#FFFFFF" stroke="{"#111418" if strong else LINE}" stroke-width="{2 if strong else 1}"/>')
    P.append(text(x + 20, y + 36, name, 19, INK, 700))
    P.append(text(x + 20, y + 58, note, 13, SUB, 400))
    P.append(place(S(f"{k}.svg"), x + 20, y + 74, 180, 180))
    P.append(f'<rect x="{x+212}" y="{y+74}" width="120" height="120" rx="14" fill="#FFFFFF" stroke="{LINE}"/>')
    if mono:
        P.append(place(S(f"{mono}.svg"), x + 216, y + 78, 112, 112))
    else:
        P.append(place(os.path.join(HERE, "..", "round-7-shift", "svg", "offset-mono-black.svg"), x + 216, y + 78, 112, 112))
    P.append(text(x + 272, y + 214, "one colour", 12, SUB, 600, "middle"))
    P.append(text(x + 20, y + 286, "Slack, real size 36 / 24 / 16", 13, INK, 700))
    P.append(avatars(S(f"{k}.svg"), x + 20, y + 298, CW - 40, False))
    P.append(avatars(S(f"{k}.svg"), x + 20, y + 372, CW - 40, True))
    P.append(text(x + 20, y + 470, "16 px, true pixels x6", 13, INK, 700))
    P.append(pixels(S(f"{k}.svg"), 16, SL, 6, x + 20, y + 482))
    P.append(pixels(S(f"{k}.svg"), 16, SD, 6, x + 124, y + 482))
    mp = S(f"{mono}.svg") if mono else os.path.join(HERE, "..", "round-7-shift", "svg", "offset-mono-black.svg")
    P.append(pixels(mp, 16, SL, 6, x + 228, y + 482))
    for j, lab in enumerate(("light", "dark", "mono")):
        P.append(text(x + 68 + j * 104, y + 596, lab, 12, SUB, 600, "middle"))
H = 100 + 610 + 24
P[0] = f'<rect width="{W}" height="{H}" fill="{BG}"/>'
doc = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(P)}</svg>'
path = os.path.join(WORK, "sheet.svg")
open(path, "w").write(doc)
subprocess.run(["rsvg-convert", "-z", "2", "-o", os.path.join(HERE, "geckit-round-8-harness.png"), path], check=True)
shutil.rmtree(WORK)
print("ok")
