import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "svg")
WORK = os.path.join(HERE, "work")
os.makedirs(SVG, exist_ok=True)
os.makedirs(WORK, exist_ok=True)
FONT = "Avenir Next"


def rr(x, y, w, h, r, shear=0.0, cy=None):
    k = math.tan(math.radians(shear))
    cy = y + h / 2 if cy is None else cy
    s = lambda px, py: (px + k * (cy - py), py)
    pts = []
    for cx, cyy, a0 in ((x + w - r, y + r, -90), (x + w - r, y + h - r, 0), (x + r, y + h - r, 90), (x + r, y + r, 180)):
        for i in range(0, 91, 10):
            a = math.radians(a0 + i)
            pts.append(s(cx + r * math.cos(a), cyy + r * math.sin(a)))
    return "M" + " L".join(f"{px:.2f} {py:.2f}" for px, py in pts) + " Z"


def slice_mark(p=None):
    p = p or {}
    y, h, r = p.get("y", 78), p.get("h", 100), p.get("r", 24)
    gap, cut = p.get("gap", 14), p.get("cut", 116)
    sh = p.get("shear", 16)
    left = rr(22, y, cut - 22 + r, h, r)
    clip_l = f'<clipPath id="sl"><rect x="0" y="0" width="{cut}" height="256"/></clipPath>'
    right = rr(cut + gap, y, 74, h, r, shear=sh, cy=y + h)
    return (f'<defs>{clip_l}</defs><path d="{left}" clip-path="url(#sl)"/>'
            f'<path d="{right}" transform="translate({p.get("dx", 0)} 0)"/>')


def through_mark(p=None):
    p = p or {}
    col = rr(p.get("cx", 36), 28, p.get("cw", 112), 200, p.get("cr", 28))
    card = rr(p.get("kx", 66), p.get("ky", 98), p.get("kw", 164), p.get("kh", 60), p.get("kr", 18), shear=p.get("shear", 16))
    return f'<path fill-rule="evenodd" d="{col} {card}"/>'


def stack_mark(p=None):
    p = p or {}
    h, g, r = p.get("h", 46), p.get("g", 16), p.get("r", 14)
    total = 3 * h + 2 * g
    y0 = 128 - total / 2
    out = [rr(36, y0, 120, h, r), rr(36, y0 + 2 * (h + g), 120, h, r)]
    out.append(rr(36 + p.get("dx", 84), y0 + h + g, 120, h, r, shear=p.get("shear", 22)))
    return "".join(f'<path d="{d}"/>' for d in out)


def svg(body, w=256, h=256, title=None):
    t = f"<title>{title}</title>" if title else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{t}{body}</svg>'


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "mono":
    for name, fn in (("slice", slice_mark), ("through", through_mark), ("stack", stack_mark)):
        open(os.path.join(WORK, f"{name}-mono.svg"), "w").write(svg(f'<g fill="#000">{fn()}</g>'))
    print("ok")


def through_parts(p=None):
    p = p or {}
    cx, cw = p.get("cx", 36), p.get("cw", 112)
    col = rr(cx, 28, cw, 200, p.get("cr", 28))
    kx, ky, kw, kh = p.get("kx", 66), p.get("ky", 98), p.get("kw", 164), p.get("kh", 60)
    card = rr(kx, ky, kw, kh, p.get("kr", 18), shear=p.get("shear", 16))
    edge = cx + cw
    return col, card, edge


def tab_only(card_d, edge):
    pts = [tuple(map(float, q.split())) for q in card_d[1:-2].split(" L")]
    out = []
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        ia, ib = a[0] >= edge, b[0] >= edge
        if ia:
            out.append(a)
        if ia != ib:
            t = (edge - a[0]) / (b[0] - a[0])
            out.append((edge, a[1] + (b[1] - a[1]) * t))
    return "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in out) + " Z"


def through_colour(col_fill, tab_fill, p=None, dx=-9):
    col, card, edge = through_parts(p)
    hole = f'<path fill-rule="evenodd" fill="{col_fill}" d="{col} {card}"/>'
    clip_inside = f'<path fill="{col_fill}" d="{col}" fill-opacity="0"/>'
    tab = f'<path fill="{tab_fill}" d="{tab_only(card, edge)}"/>'
    return f'<g transform="translate({dx} 0)">{hole}{tab}</g>'


def colour_trials():
    G, L, Wt = "#16191D", "#C8F135", "#FFFFFF"
    tiles = {"all-lime": (L, L), "lime-white": (L, Wt), "white-lime": (Wt, L)}
    for k, (a, b) in tiles.items():
        body = f'<rect width="256" height="256" rx="58" fill="{G}"/>' + through_colour(a, b, dict(), -9)
        open(os.path.join(WORK, f"try-{k}.svg"), "w").write(svg(body))


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "colour":
    colour_trials()
    print("ok")


G, L, WT = "#16191D", "#C8F135", "#FFFFFF"


def fit(body, cx, cy, s):
    return f'<g transform="translate(128 128) scale({s}) translate({-cx} {-cy})">{body}</g>'


def through_art(a, b, p=None):
    col, card, edge = through_parts(p)
    return fit(f'<path fill-rule="evenodd" fill="{a}" d="{col} {card}"/><path fill="{b}" d="{tab_only(card, edge)}"/>', 137, 128, 0.8)


def slice_art(a, b):
    y, h, r, gap, cut = 78, 100, 24, 14, 116
    left = rr(22, y, cut - 22 + r, h, r)
    right = rr(cut + gap, y, 74, h, r, shear=16, cy=y + h)
    clip = tab_only(left, -1e9)
    pts = [tuple(map(float, q.split())) for q in left[1:-2].split(" L")]
    lp = []
    for i in range(len(pts)):
        p0, p1 = pts[i], pts[(i + 1) % len(pts)]
        i0, i1 = p0[0] <= cut, p1[0] <= cut
        if i0:
            lp.append(p0)
        if i0 != i1:
            t = (cut - p0[0]) / (p1[0] - p0[0])
            lp.append((cut, p0[1] + (p1[1] - p0[1]) * t))
    ld = "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in lp) + " Z"
    return fit(f'<path fill="{a}" d="{ld}"/><path fill="{b}" d="{right}"/>', 128, 128, 0.86)


def stack_art(a, b):
    h, g, r = 46, 16, 14
    y0 = 128 - (3 * h + 2 * g) / 2
    still = rr(36, y0, 120, h, r) + " " + rr(36, y0 + 2 * (h + g), 120, h, r)
    moving = rr(120, y0 + h + g, 120, h, r, shear=22)
    return fit(f'<path fill="{a}" d="{still}"/><path fill="{b}" d="{moving}"/>', 140, 128, 0.84)


def tile(art):
    return f'<rect width="256" height="256" rx="58" fill="{G}"/>{art}'


def wordmark(x, y, size, color, weight=700):
    p = os.path.join(WORK, "measure.svg")
    open(p, "w").write(svg(f'<text id="t" x="0" y="100" font-family="{FONT}" font-weight="{weight}" font-size="{size}">Geck</text>', 2000, 200))
    geck = float(subprocess.run(["inkscape", p, "--query-id=t", "--query-width"], check=True, capture_output=True, text=True).stdout)
    cap, stem, serif, bar, gap = size * 0.708, size * 0.14, size * 0.30, size * 0.105, size * 0.035
    ix = x + geck + gap + serif / 2
    i = (f'<rect x="{ix - stem/2:.1f}" y="{y - cap:.1f}" width="{stem:.1f}" height="{cap:.1f}"/>'
         f'<rect x="{ix - serif/2:.1f}" y="{y - cap:.1f}" width="{serif:.1f}" height="{bar:.1f}"/>'
         f'<rect x="{ix - serif/2:.1f}" y="{y - bar:.1f}" width="{serif:.1f}" height="{bar:.1f}"/>')
    t = lambda s, xx: f'<text x="{xx:.1f}" y="{y}" font-family="{FONT}" font-weight="{weight}" font-size="{size}">{s}</text>'
    return f'<g fill="{color}">{t("Geck", x)}{i}{t("t", ix + serif / 2 + gap)}</g>'


def offset_main(a, b):
    return offset_art(a, b, OFFSET_TRIES["o4"])


def build_all():
    arts = {"through": through_art, "slice": slice_art, "stack": stack_art, "offset": offset_main}
    for k, fn in arts.items():
        open(os.path.join(SVG, f"{k}.svg"), "w").write(svg(tile(fn(WT, L)), title=f"GeckIt Shift, {k}"))
        open(os.path.join(SVG, f"{k}-mono-black.svg"), "w").write(svg(fn("#000000", "#000000"), title=f"GeckIt Shift, {k}, one colour"))
    for theme, ink in (("light", "#111418"), ("dark", "#F5F6F7")):
        for name, fn in (("through", through_art), ("offset", offset_main)):
            body = f'<svg x="0" y="4" width="112" height="112" viewBox="0 0 256 256">{tile(fn(WT, L))}</svg>' + wordmark(136, 88, 76, ink)
            raw = os.path.join(WORK, f"lockup-{name}-{theme}.svg")
            open(raw, "w").write(svg(body, 420, 120, "GeckIt"))
            subprocess.run(["inkscape", raw, "--export-text-to-path", "--export-plain-svg", f"--export-filename={os.path.join(SVG, f'{name}-lockup-{theme}.svg')}"], check=True, capture_output=True)




def offset_art(a, b, p=None):
    p = p or {}
    w, h, gap, dx, r = p.get("w", 150), p.get("h", 150), p.get("gap", 14), p.get("dx", 44), p.get("r", 18)
    sh = p.get("shear", 0)
    hh = (h - gap) / 2
    x0, y0 = 128 - (w + dx) / 2, 128 - h / 2
    top = rr(x0 + dx, y0, w, hh, r, shear=sh)
    bot = rr(x0, y0 + hh + gap, w, hh, r)
    return fit(f'<path fill="{b}" d="{top}"/><path fill="{a}" d="{bot}"/>', 128, 128, p.get("s", 1.0))


OFFSET_TRIES = {
    "o1": dict(),
    "o2": dict(w=176, h=132, gap=16, dx=52, r=16),
    "o3": dict(w=150, h=150, gap=14, dx=44, r=18, shear=14),
    "o4": dict(w=150, h=136, gap=16, dx=60, r=18, shear=22, s=0.92),
}

if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "offset":
    for k, v in OFFSET_TRIES.items():
        open(os.path.join(WORK, f"{k}.svg"), "w").write(svg(offset_art("#000", "#000", v)))
    print("ok")


if __name__ == "__main__" and len(sys.argv) == 1:
    build_all()
    print("ok")
