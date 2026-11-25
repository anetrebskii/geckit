import base64
import math
import os
import re
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
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


def left():
    return [rr(40, 48, 32, 160, 14), rr(40, 48, 78, 32, 14), rr(40, 176, 78, 32, 14)]


def frame_open(a, b):
    still = " ".join([rr(48, 48, 32, 160, 14), rr(48, 48, 86, 32, 14), rr(48, 176, 86, 32, 14)])
    return f'<path fill="{a}" d="{still}"/><path fill="{b}" d="{rr(104, 104, 120, 48, 16, shear=22)}"/>'


def frame_closed(a, b):
    right = [rr(184, 48, 32, 160, 14), rr(138, 48, 78, 32, 14), rr(138, 176, 78, 32, 14)]
    return f'<path fill="{a}" d="{" ".join(left() + right)}"/><path fill="{b}" d="{rr(90, 104, 76, 48, 16, shear=22)}"/>'


def frame_break(a, b):
    right = [rr(184, 48, 32, 52, 14), rr(138, 48, 78, 32, 14), rr(184, 156, 32, 52, 14), rr(138, 176, 78, 32, 14)]
    return f'<path fill="{a}" d="{" ".join(left() + right)}"/><path fill="{b}" d="{rr(92, 108, 152, 40, 14, shear=22)}"/>'


def svg(body, w=256, h=256, title=None):
    t = f"<title>{title}</title>" if title else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{t}{body}</svg>'


def tile(art):
    return f'<rect width="256" height="256" rx="58" fill="{G}"/><g transform="translate(128 128) scale(0.9) translate(-128 -128)">{art}</g>'


MARKS = {"frame-open": frame_open, "frame-closed": frame_closed, "frame-break": frame_break}
for k, fn in MARKS.items():
    open(os.path.join(SVG, f"{k}.svg"), "w").write(svg(tile(fn(WT, GR)), title=f"GeckIt round 9, {k}"))
    open(os.path.join(SVG, f"{k}-mono-black.svg"), "w").write(svg(fn("#000000", "#000000"), title=f"GeckIt round 9, {k}, one colour"))
    open(os.path.join(SVG, f"{k}-mono-white.svg"), "w").write(svg(f'<rect width="256" height="256" fill="#000000"/>' + fn("#FFFFFF", "#FFFFFF"), title=f"GeckIt round 9, {k}, reversed"))

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
    ("frame-open", "Frame, round 8", "Open on the right: the AI leaves"),
    ("frame-closed", "A  Closed frame", "Both brackets: the AI held inside"),
    ("frame-break", "B  Breaks through", "Both brackets: the AI breaks out right"),
]
W, CW = 1200, 384
P = [""]
P.append(text(32, 52, "GeckIt round 9: the frame, closed on the right", 28, INK, 700))
P.append(text(32, 80, "Same bars, 22° lean, app green #4AC85C. Frame from round 8 kept for reference.", 15, SUB, 400))
for i, (k, name, note) in enumerate(COLS):
    x = 24 + i * (CW + 8)
    y = 100
    strong = i == 2
    P.append(f'<rect x="{x}" y="{y}" width="{CW}" height="640" rx="18" fill="#FFFFFF" stroke="{"#111418" if strong else LINE}" stroke-width="{2 if strong else 1}"/>')
    P.append(text(x + 20, y + 36, name, 19, INK, 700))
    P.append(text(x + 20, y + 58, note, 13, SUB, 400))
    P.append(place(S(f"{k}.svg"), x + 20, y + 74, 200, 200))
    P.append(f'<rect x="{x+236}" y="{y+74}" width="128" height="96" rx="12" fill="#FFFFFF" stroke="{LINE}"/>')
    P.append(place(S(f"{k}-mono-black.svg"), x + 256, y + 78, 88, 88))
    P.append(f'<rect x="{x+236}" y="{y+178}" width="128" height="96" rx="12" fill="#000000"/>')
    P.append(place(S(f"{k}-mono-white.svg"), x + 256, y + 182, 88, 88))
    P.append(text(x + 300, y + 294, "mono / reversed", 12, SUB, 600, "middle"))
    P.append(text(x + 20, y + 322, "Slack, real size 36 / 24 / 16", 13, INK, 700))
    P.append(avatars(S(f"{k}.svg"), x + 20, y + 334, CW - 40, False))
    P.append(avatars(S(f"{k}.svg"), x + 20, y + 406, CW - 40, True))
    P.append(text(x + 20, y + 500, "True pixels: 32 dark, 16 light, 16 dark, 16 mono", 13, INK, 700))
    P.append(pixels(S(f"{k}.svg"), 32, SD, 3, x + 20, y + 514))
    P.append(pixels(S(f"{k}.svg"), 16, SL, 5, x + 124, y + 530))
    P.append(pixels(S(f"{k}.svg"), 16, SD, 5, x + 206, y + 530))
    P.append(pixels(S(f"{k}-mono-black.svg"), 16, SL, 5, x + 288, y + 530))
H = 100 + 640 + 24
P[0] = f'<rect width="{W}" height="{H}" fill="{BG}"/>'
doc = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(P)}</svg>'
path = os.path.join(WORK, "sheet.svg")
open(path, "w").write(doc)
subprocess.run(["rsvg-convert", "-z", "2", "-o", os.path.join(HERE, "geckit-round-9-frame.png"), path], check=True)
for k in MARKS:
    for s in (16, 32, 512):
        subprocess.run(["rsvg-convert", "-w", str(s), "-o", os.path.join(WORK, f"{k}-{s}.png"), S(f"{k}.svg")], check=True)
print("ok")
