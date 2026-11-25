import math
import os
import re
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
R7 = os.path.join(HERE, "..", "round-7-shift", "svg")
SVG = os.path.join(HERE, "svg")
WORK = os.path.join(HERE, "work")
os.makedirs(SVG, exist_ok=True)
os.makedirs(WORK, exist_ok=True)
F = "Avenir Next"
G, L, WT = "#16191D", "#C8F135", "#FFFFFF"
INK, SUB, LINE = "#111418", "#555B63", "#E3E5E8"


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


def offset_art(a, b, dx=60, sh=22):
    w, h, gap, r = 150, 136, 16, 18
    hh = (h - gap) / 2
    x0, y0 = 128 - (w + 60) / 2, 128 - h / 2
    top = rr(x0 + dx, y0, w, hh, r, shear=sh)
    bot = rr(x0, y0 + hh + gap, w, hh, r)
    return f'<g transform="translate(128 128) scale(0.92) translate(-128 -128)"><path fill="{b}" d="{top}"/><path fill="{a}" d="{bot}"/></g>'


def svg(body, w=256, h=256, title=None):
    t = f"<title>{title}</title>" if title else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{t}{body}</svg>'


def tile(art):
    return f'<rect width="256" height="256" rx="58" fill="{G}"/>{art}'


def wordmark(x, y, size, color, weight=700):
    p = os.path.join(WORK, "measure.svg")
    open(p, "w").write(svg(f'<text id="t" x="0" y="100" font-family="{F}" font-weight="{weight}" font-size="{size}">Geck</text>', 2000, 200))
    geck = float(subprocess.run(["inkscape", p, "--query-id=t", "--query-width"], check=True, capture_output=True, text=True).stdout)
    cap, stem, serif, bar, gap = size * 0.708, size * 0.14, size * 0.30, size * 0.105, size * 0.035
    ix = x + geck + gap + serif / 2
    i = (f'<rect x="{ix - stem/2:.1f}" y="{y - cap:.1f}" width="{stem:.1f}" height="{cap:.1f}"/>'
         f'<rect x="{ix - serif/2:.1f}" y="{y - cap:.1f}" width="{serif:.1f}" height="{bar:.1f}"/>'
         f'<rect x="{ix - serif/2:.1f}" y="{y - bar:.1f}" width="{serif:.1f}" height="{bar:.1f}"/>')
    t = lambda s, xx: f'<text x="{xx:.1f}" y="{y}" font-family="{F}" font-weight="{weight}" font-size="{size}">{s}</text>'
    return f'<g fill="{color}">{t("Geck", x)}{i}{t("t", ix + serif / 2 + gap)}</g>'


for n in ("offset.svg", "offset-mono-black.svg"):
    shutil.copy(os.path.join(R7, n), os.path.join(SVG, n))
open(os.path.join(SVG, "offset-taken.svg"), "w").write(svg(tile(offset_art(WT, L, dx=0, sh=0)), title="GeckIt Offset, task taken (motion frame 1)"))
for theme, ink, role in (("light", "#111418", "#555B63"), ("dark", "#F5F6F7", "#A9AFB7")):
    body = (f'<svg x="0" y="6" width="116" height="116" viewBox="0 0 256 256">{tile(offset_art(WT, L))}</svg>'
            + wordmark(140, 74, 70, ink)
            + f'<text x="142" y="112" font-family="{F}" font-weight="500" font-size="25" fill="{role}">AI teammate in Slack</text>')
    raw = os.path.join(WORK, f"teammate-{theme}.svg")
    open(raw, "w").write(svg(body, 420, 128, "GeckIt, AI teammate in Slack"))
    subprocess.run(["inkscape", raw, "--export-text-to-path", "--export-plain-svg",
                    f"--export-filename={os.path.join(SVG, f'offset-teammate-lockup-{theme}.svg')}"], check=True, capture_output=True)
print("ok")
