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


def normal(d):
    return (d[1], -d[0])


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


def geometry(w, arm, exit_len, slant=12, V=(116, 172)):
    tan = math.tan(math.radians(slant))
    y0, y1 = 60, 212
    shift = (y1 - y0) * tan
    block = [(34, y1), (182, y1), (182 + shift, y0), (34 + shift, y0)]
    corner = block[2]
    d2 = unit(V, corner)
    S = add(V, (-1 / math.sqrt(2), -1 / math.sqrt(2)), arm)
    T = add(corner, d2, exit_len)
    return block, check_poly(S, V, T, w)


def fit(polys, box=(30, 226)):
    xs = [p[0] for poly in polys for p in poly]
    ys = [p[1] for poly in polys for p in poly]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    k = (box[1] - box[0]) / max(w, h)
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    return lambda p: (128 + (p[0] - cx) * k, 126 + (p[1] - cy) * k)


def d(poly, f):
    return "M" + " L".join(f"{f(p)[0]:.2f} {f(p)[1]:.2f}" for p in poly) + " Z"


def mark(small=False):
    if small:
        block, chk = geometry(w=40, arm=58, exit_len=28, V=(122, 168))
        f = fit([block, chk], (26, 230))
    else:
        block, chk = geometry(w=34, arm=46, exit_len=42)
        f = fit([block, chk], (34, 222))
    return f'<path fill-rule="evenodd" d="{d(block, f)} {d(chk, f)}"/>'


def svg(body, w, h, title=None):
    t = f"<title>{title}</title>" if title else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{t}{body}</svg>'


def tile(small=False):
    rim = f'<rect x="2" y="2" width="252" height="252" rx="56" fill="none" stroke="{RIM}" stroke-width="4"/>'
    return f'<rect width="256" height="256" rx="58" fill="{GRAPHITE}"/>{rim}<g fill="{LIME}">{mark(small)}</g>'


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


write("breakout.svg", svg(tile(), 256, 256, "GeckIt Breakout"))
write("breakout-16.svg", svg(tile(True), 256, 256, "GeckIt Breakout, 16 px"))
write("breakout-mark.svg", svg(f'<g fill="{LIME}">{mark()}</g>', 256, 256, "GeckIt Breakout mark"))
write("breakout-mono-black.svg", svg(f'<g fill="#000000">{mark()}</g>', 256, 256, "GeckIt Breakout, one colour"))
write("breakout-mono-white.svg", svg(f'<g fill="#FFFFFF">{mark()}</g>', 256, 256, "GeckIt Breakout, one colour reversed"))
write("breakout-16-mono-black.svg", svg(f'<g fill="#000000">{mark(True)}</g>', 256, 256, "GeckIt Breakout, 16 px one colour"))
for theme, ink in (("light", "#111418"), ("dark", "#F5F6F7")):
    body = f'<svg x="0" y="4" width="112" height="112" viewBox="0 0 256 256">{tile()}</svg>' + wordmark(136, 88, 76, ink)
    raw = os.path.join(WORK, f"lockup-{theme}.svg")
    open(raw, "w").write(svg(body, 420, 120, "GeckIt"))
    run("inkscape", raw, "--export-text-to-path", "--export-plain-svg", f"--export-filename={os.path.join(SVG, f'breakout-lockup-{theme}.svg')}")
print("ok")
