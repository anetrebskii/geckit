import math
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "svg")
WORK = os.path.join(HERE, "work")
os.makedirs(SVG, exist_ok=True)
os.makedirs(WORK, exist_ok=True)
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


def poly(pts):
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + " Z"


def check_poly(S, V, T, w_short, w_v, w_t):
    d1, d2 = unit(S, V), unit(V, T)
    n1, n2 = normal(d1), normal(d2)
    top = cross(add(S, n1, w_short / 2), d1, add(V, n2, w_v / 2), unit(add(V, n2, w_v / 2), add(T, n2, w_t / 2)))
    bot = cross(add(S, n1, -w_short / 2), d1, add(V, n2, -w_v / 2), unit(add(V, n2, -w_v / 2), add(T, n2, -w_t / 2)))
    return [add(S, n1, w_short / 2), top, add(T, n2, w_t / 2), add(T, n2, -w_t / 2), bot, add(S, n1, -w_short / 2)]


def lane(S, V, T, o):
    d1, d2 = unit(S, V), unit(V, T)
    n1, n2 = normal(d1), normal(d2)
    S2, T2 = add(S, n1, o), add(T, n2, o)
    return S2, cross(S2, d1, T2, d2), T2


def mark_a(fg, bg, uid="a"):
    block = [(40, 206), (176, 206), (206, 66), (70, 66)]
    V = (112, 174)
    T = add(V, unit(V, (206, 66)), 168)
    chk = poly(check_poly((74, 136), V, T, 30, 30, 30))
    b = poly(block)
    return (
        f'<defs><clipPath id="{uid}in"><path d="{b}"/></clipPath>'
        f'<clipPath id="{uid}out"><path d="M0 0 H256 V256 H0 Z {b}" clip-rule="evenodd"/></clipPath></defs>'
        f'<path d="{b}" fill="{fg}"/>'
        f'<path d="{chk}" fill="{bg}" clip-path="url(#{uid}in)"/>'
        f'<path d="{chk}" fill="{fg}" clip-path="url(#{uid}out)"/>'
    )


def mark_b(fg, bg, uid="b"):
    S, V, T = (56, 126), (104, 174), (214, 50)
    w = 44
    pts = check_poly(S, V, T, w, w, w)
    top = pts[1]
    d1 = unit(S, V)
    n1 = normal(d1)
    C = add(top, n1, -w / 2)
    front = poly([top, pts[2], pts[3], pts[4], add(C, n1, -w / 2)])
    back = poly([pts[0], top, add(C, n1, -w / 2), pts[5]])
    sh = add((0, 0), d1, -18)
    return (f'<g transform="translate(12 10)"><path d="{front}" fill="{fg}"/>'
            f'<path d="{back}" fill="{fg}" transform="translate({sh[0]:.1f} {sh[1]:.1f})"/></g>')


def mark_c(fg, bg, uid="c"):
    pts = check_poly((52, 136), (100, 184), (214, 52), 30, 30, 74)
    cuts = "".join(f'<rect x="0" y="{y}" width="256" height="9" fill="{bg}"/>' for y in (92, 116))
    return (f'<defs><clipPath id="{uid}k"><path d="{poly(pts)}"/></clipPath></defs>'
            f'<path d="{poly(pts)}" fill="{fg}"/><g clip-path="url(#{uid}k)">{cuts}</g>')


CONCEPTS = [
    dict(key="a", name="Breakout", mark=mark_a, tile="#0E1116", fg="#C8F135", skew=0, weight=700),
    dict(key="b", name="Stride", mark=mark_b, tile="#1F4BFF", fg="#FFFFFF", skew=0, weight=700),
    dict(key="c", name="Wedge", mark=mark_c, tile="#FF5A1F", fg="#FFFFFF", skew=-10, weight=800),
]


def svg(body, w, h, title=None):
    t = f"<title>{title}</title>" if title else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{t}{body}</svg>'


def run(*a):
    return subprocess.run(a, check=True, capture_output=True, text=True).stdout


def text_width(s, size, weight):
    p = os.path.join(WORK, "measure.svg")
    open(p, "w").write(svg(f'<text id="t" x="0" y="100" font-family="{FONT}" font-weight="{weight}" font-size="{size}">{s}</text>', 2000, 200))
    return float(run("inkscape", p, "--query-id=t", "--query-width"))


def wordmark(x, y, size, color, weight, skew):
    geck = text_width("Geck", size, weight)
    cap, stem, serif, bar, gap = size * 0.708, size * 0.14, size * 0.30, size * 0.105, size * 0.035
    ix = x + geck + gap + serif / 2
    i = (f'<rect x="{ix - stem/2:.1f}" y="{y - cap:.1f}" width="{stem:.1f}" height="{cap:.1f}"/>'
         f'<rect x="{ix - serif/2:.1f}" y="{y - cap:.1f}" width="{serif:.1f}" height="{bar:.1f}"/>'
         f'<rect x="{ix - serif/2:.1f}" y="{y - bar:.1f}" width="{serif:.1f}" height="{bar:.1f}"/>')
    tx = ix + serif / 2 + gap
    t = lambda s, xx: f'<text x="{xx:.1f}" y="{y}" font-family="{FONT}" font-weight="{weight}" font-size="{size}">{s}</text>'
    sk = f' transform="translate({-y * math.tan(math.radians(skew)):.1f} 0) skewX({skew})"' if skew else ""
    return f'<g fill="{color}"{sk}>{t("Geck", x)}{i}{t("t", tx)}</g>'


def tile(c, fg=None, bg=None):
    fg, bg = fg or c["fg"], bg or c["tile"]
    return f'<rect width="256" height="256" rx="58" fill="{bg}"/>{c["mark"](fg, bg, c["key"] + "t")}'


for c in CONCEPTS:
    k = c["key"]
    open(os.path.join(SVG, f"{k}-symbol.svg"), "w").write(svg(tile(c), 256, 256, f'GeckIt {c["name"]}'))
    open(os.path.join(SVG, f"{k}-mark-black.svg"), "w").write(svg(c["mark"]("#000000", "#FFFFFF"), 256, 256, f'GeckIt {c["name"]} mark'))
    open(os.path.join(SVG, f"{k}-mark-white.svg"), "w").write(svg(c["mark"]("#FFFFFF", "#000000"), 256, 256))
    for theme, ink in (("light", "#0B0D10"), ("dark", "#F5F6F7")):
        body = f'<svg x="0" y="4" width="112" height="112" viewBox="0 0 256 256">{tile(c)}</svg>' + wordmark(136, 88, 76, ink, c["weight"], c["skew"])
        raw = os.path.join(WORK, f"{k}-lockup-{theme}.svg")
        open(raw, "w").write(svg(body, 430, 120, "GeckIt"))
        run("inkscape", raw, "--export-text-to-path", "--export-plain-svg", f"--export-filename={os.path.join(SVG, f'{k}-lockup-{theme}.svg')}")
print("ok")
