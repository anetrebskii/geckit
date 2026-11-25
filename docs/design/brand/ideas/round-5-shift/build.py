import math
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "svg")
WORK = os.path.join(HERE, "work")
os.makedirs(SVG, exist_ok=True)
os.makedirs(WORK, exist_ok=True)

LIME = "#C8F135"
GRAPHITE = "#1E2329"
RIM = "#343B45"
FONT = "Avenir Next"


def add(a, b, k=1):
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def unit(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    l = math.hypot(dx, dy)
    return (dx / l, dy / l)


def normal(v):
    return (v[1], -v[0])


def cross(p, r, q, s):
    rxs = r[0] * s[1] - r[1] * s[0]
    t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / rxs
    return add(p, r, t)


def check_poly(S, V, T, w):
    d1, d2 = unit(S, V), unit(V, T)
    n1, n2 = normal(d1), normal(d2)
    h = w / 2
    top = cross(add(S, n1, h), d1, add(V, n2, h), d2)
    bot = cross(add(S, n1, -h), d1, add(V, n2, -h), d2)
    return [add(S, n1, h), top, add(T, n2, h), add(T, n2, -h), bot, add(S, n1, -h)]


def path(poly):
    return "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in poly) + " Z"


def mark(cx=128, cw=138, ch=96, shear_deg=22, line_x=176, line_w=12, gap=10, tick=24, line=(40, 216), with_line=True, crossing=True, svt=((0.27, 0.5), (0.43, 0.76), (0.74, 0.24))):
    k = math.tan(math.radians(shear_deg))
    cy = 128
    x0, y0 = cx - cw / 2, cy - ch / 2
    px = lambda u, v: (x0 + u * cw, y0 + v * ch)
    shear = lambda p: (p[0] + k * (cy - p[1]), p[1])
    box = [shear(px(0, 0)), shear(px(1, 0)), shear(px(1, 1)), shear(px(0, 1))]
    S, V, T = (px(*p) for p in svt)
    chk = [shear(p) for p in check_poly(S, V, T, tick)]
    out = f'<path fill-rule="evenodd" d="{path(box)} {path(chk)}"/>'
    if with_line and not crossing:
        lx = line_x - line_w / 2
        out += f'<rect x="{lx:.2f}" y="{line[0]}" width="{line_w}" height="{line[1] - line[0]}"/>'
    elif with_line:
        top, bot = y0 - gap, y0 + ch + gap
        lx = line_x - line_w / 2
        out += f'<path d="M{lx:.2f} {line[0]} H{lx + line_w:.2f} V{top:.2f} H{lx:.2f} Z M{lx:.2f} {bot:.2f} H{lx + line_w:.2f} V{line[1]} H{lx:.2f} Z"/>'
    return out


def board(line_x, line_w, faint=True, cards=True):
    c = RIM
    lx = line_x - line_w / 2
    o = f'<rect x="22" y="40" width="6" height="176" fill="{c}"/>'
    if cards:
        o += f'<rect x="40" y="46" width="{lx - 52:.0f}" height="26" rx="5" fill="{c}"/><rect x="40" y="184" width="{lx - 52:.0f}" height="26" rx="5" fill="{c}"/>'
    return o


MAIN = dict()
SMALL = dict(cx=116, cw=168, ch=116, shear_deg=18, line_x=186, line_w=24, gap=14, tick=38, line=(16, 240), svt=((0.2, 0.44), (0.42, 0.72), (0.8, 0.2)))
CARD = dict(cw=118, ch=84, tick=18)
FRAMES = [
    dict(cx=86, shear_deg=0, crossing=False, **CARD),
    dict(cx=98, shear_deg=12, crossing=False, **CARD),
    dict(cx=150, shear_deg=22, **CARD),
]


def svg(body, w, h, title=None):
    t = f"<title>{title}</title>" if title else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{t}{body}</svg>'


def tile(extra="", **kw):
    rim = f'<rect x="2" y="2" width="252" height="252" rx="56" fill="none" stroke="{RIM}" stroke-width="4"/>'
    return f'<rect width="256" height="256" rx="58" fill="{GRAPHITE}"/>{rim}{extra}<g fill="{LIME}">{mark(**kw)}</g>'


def run(*a):
    return subprocess.run(a, check=True, capture_output=True, text=True).stdout


def text_width(s, size, weight):
    p = os.path.join(WORK, "measure.svg")
    open(p, "w").write(svg(f'<text id="t" x="0" y="100" font-family="{FONT}" font-weight="{weight}" font-size="{size}">{s}</text>', 2000, 200))
    return float(run("inkscape", p, "--query-id=t", "--query-width"))


def wordmark(x, y, size, color, weight=700):
    geck = text_width("Geck", size, weight)
    cap, stem, serif, bar, gap = size * 0.708, size * 0.14, size * 0.30, size * 0.105, size * 0.035
    ix = x + geck + gap + serif / 2
    i = (f'<rect x="{ix - stem/2:.1f}" y="{y - cap:.1f}" width="{stem:.1f}" height="{cap:.1f}"/>'
         f'<rect x="{ix - serif/2:.1f}" y="{y - cap:.1f}" width="{serif:.1f}" height="{bar:.1f}"/>'
         f'<rect x="{ix - serif/2:.1f}" y="{y - bar:.1f}" width="{serif:.1f}" height="{bar:.1f}"/>')
    tx = ix + serif / 2 + gap
    t = lambda s, xx: f'<text x="{xx:.1f}" y="{y}" font-family="{FONT}" font-weight="{weight}" font-size="{size}">{s}</text>'
    return f'<g fill="{color}">{t("Geck", x)}{i}{t("t", tx)}</g>'


def write(name, content):
    open(os.path.join(SVG, name), "w").write(content)


write("shift.svg", svg(tile(**MAIN), 256, 256, "GeckIt Shift"))
write("shift-16.svg", svg(tile(**SMALL), 256, 256, "GeckIt Shift, 16 px"))
write("shift-mono-black.svg", svg(f'<g fill="#000000">{mark(**MAIN)}</g>', 256, 256, "GeckIt Shift, one colour"))
write("shift-16-mono-black.svg", svg(f'<g fill="#000000">{mark(**SMALL)}</g>', 256, 256, "GeckIt Shift, 16 px one colour"))
for i, f in enumerate(FRAMES):
    write(f"shift-frame-{i + 1}.svg", svg(tile(extra=board(176, 12), **f), 256, 256))
for theme, ink in (("light", "#111418"), ("dark", "#F5F6F7")):
    body = f'<svg x="0" y="4" width="112" height="112" viewBox="0 0 256 256">{tile(**MAIN)}</svg>' + wordmark(136, 88, 76, ink)
    raw = os.path.join(WORK, f"lockup-{theme}.svg")
    open(raw, "w").write(svg(body, 420, 120, "GeckIt"))
    run("inkscape", raw, "--export-text-to-path", "--export-plain-svg", f"--export-filename={os.path.join(SVG, f'shift-lockup-{theme}.svg')}")
print("ok")
