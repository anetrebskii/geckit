import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
R5 = os.path.join(HERE, "..", "round-5-shift", "build.py")
SVG = os.path.join(HERE, "svg")
WORK = os.path.join(HERE, "work")
os.makedirs(SVG, exist_ok=True)
os.makedirs(WORK, exist_ok=True)

src = open(R5).read().split('write("shift.svg"')[0]
ns = {"__file__": R5}
exec(src, ns)
LIME, GRAPHITE, RIM = ns["LIME"], ns["GRAPHITE"], ns["RIM"]
svg, wordmark, run = ns["svg"], ns["wordmark"], ns["run"]
ns["WORK"] = WORK


def plain(cx=128, cw=138, ch=96, shear_deg=22, line_x=176, line_w=12, gap=10, line=(40, 216)):
    import math
    k = math.tan(math.radians(shear_deg))
    cy = 128
    x0, y0 = cx - cw / 2, cy - ch / 2
    shear = lambda p: (p[0] + k * (cy - p[1]), p[1])
    box = [shear(p) for p in ((x0, y0), (x0 + cw, y0), (x0 + cw, y0 + ch), (x0, y0 + ch))]
    top, bot = y0 - gap, y0 + ch + gap
    lx = line_x - line_w / 2
    return (f'<path d="{ns["path"](box)}"/>'
            f'<path d="M{lx:.2f} {line[0]} H{lx + line_w:.2f} V{top:.2f} H{lx:.2f} Z M{lx:.2f} {bot:.2f} H{lx + line_w:.2f} V{line[1]} H{lx:.2f} Z"/>')


VARIANTS = {
    "same": dict(),
    "slim": dict(cx=124, cw=144, ch=80, line_x=178, gap=12, line=(44, 212)),
    "slim16": dict(cx=120, cw=164, ch=96, shear_deg=20, line_x=184, line_w=22, gap=16, line=(24, 232)),
}
MAIN = VARIANTS["slim"]
SMALL = VARIANTS["slim16"]


def tile(**kw):
    rim = f'<rect x="2" y="2" width="252" height="252" rx="56" fill="none" stroke="{RIM}" stroke-width="4"/>'
    return f'<rect width="256" height="256" rx="58" fill="{GRAPHITE}"/>{rim}<g fill="{LIME}">{plain(**kw)}</g>'


def write(name, content):
    open(os.path.join(SVG, name), "w").write(content)


if len(sys.argv) > 1:
    for k, v in VARIANTS.items():
        open(os.path.join(WORK, f"try-{k}.svg"), "w").write(svg(tile(**v), 256, 256))
    sys.exit()

write("shift-plain.svg", svg(tile(**MAIN), 256, 256, "GeckIt Shift, plain card"))
write("shift-plain-16.svg", svg(tile(**SMALL), 256, 256, "GeckIt Shift, plain card, 16 px"))
write("shift-plain-mono-black.svg", svg(f'<g fill="#000000">{plain(**MAIN)}</g>', 256, 256, "GeckIt Shift, plain card, one colour"))
for theme, ink in (("light", "#111418"), ("dark", "#F5F6F7")):
    body = f'<svg x="0" y="4" width="112" height="112" viewBox="0 0 256 256">{tile(**MAIN)}</svg>' + wordmark(136, 88, 76, ink)
    raw = os.path.join(WORK, f"lockup-{theme}.svg")
    open(raw, "w").write(svg(body, 420, 120, "GeckIt"))
    run("inkscape", raw, "--export-text-to-path", "--export-plain-svg", f"--export-filename={os.path.join(SVG, f'shift-plain-lockup-{theme}.svg')}")
print("ok")
