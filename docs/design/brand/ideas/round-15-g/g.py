import math, os, sys, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "round-10-wordmark"))
_spec = importlib.util.spec_from_file_location("r14", os.path.join(HERE, "..", "round-14-xcharter", "build.py"))
r14 = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(r14)
INK, GR, WT = r14.INK, r14.GR_DARK, r14.WT


def se(cx, cy, a, b, n, steps=240):
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        pts.append((cx + a * abs(c) ** (2 / n) * (1 if c >= 0 else -1), cy + b * abs(s) ** (2 / n) * (1 if s >= 0 else -1)))
    return "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in pts) + " Z"


def wedge(cx, cy, a0, a1, r=200):
    pts = [(cx, cy)] + [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in (a0, (a0 + a1) / 2, a1)]
    return "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in pts) + " Z"


def letter(col, n=2.3, a=76, b=88, side=30, top=19, ap=(-62, -8), bar_y=128, bar_h=20, bar_x0=132, stem_w=30, spur=0, beak=0, cut="v", mid=None, uid="g"):
    cx, cy = 128, 128
    ring = se(cx, cy, a, b, n) + " " + se(cx + 2, cy, a - side, b - top, n)
    w = wedge(cx, cy, ap[0], ap[1])
    m = f'<mask id="m{uid}"><rect width="256" height="256" fill="#fff"/><path d="{w}" fill="#000"/></mask>'
    out = [m, f'<path d="{ring}" fill-rule="evenodd" fill="{col}" mask="url(#m{uid})"/>']
    right = cx + a
    out.append(f'<rect x="{bar_x0}" y="{bar_y}" width="{right - bar_x0}" height="{bar_h}" fill="{col}"/>')
    sy1 = cy + b * 0.55 + spur
    out.append(f'<rect x="{right - stem_w}" y="{bar_y}" width="{stem_w}" height="{sy1 - bar_y}" fill="{col}"/>')
    if beak:
        t = math.radians(ap[0])
        tx, ty = cx + a * math.cos(t), cy + b * math.sin(t) * 1.0
        out.append(f'<rect x="{tx - 6:.1f}" y="{ty - 4:.1f}" width="12" height="{beak}" fill="{col}"/>')
    return "".join(out)


VARIANTS = {
    "g1-heavy": dict(n=2.2, side=34, top=20, ap=(-58, -6), bar_x0=134, bar_h=22, stem_w=34, spur=14),
    "g2-deep-bar": dict(n=2.2, side=30, top=18, ap=(-60, -4), bar_x0=104, bar_h=20, stem_w=30, beak=30),
    "g3-squircle": dict(n=3.2, a=78, b=84, side=32, top=20, ap=(-56, -6), bar_x0=126, bar_h=22, stem_w=32),
}


def svg(body, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><title>{title}</title>{body}</svg>'


def fit(body, k=0.78):
    return f'<g transform="translate(128 128) scale({k}) translate(-128 -128)">{body}</g>'


if __name__ == "__main__":
    out = os.path.join(HERE, "svg")
    variants = dict(VARIANTS)
    for k, kw in variants.items():
        open(f"{out}/{k}.svg", "w").write(svg(f'<rect width="256" height="256" rx="58" fill="{INK}"/>' + fit(letter(GR, uid=k, **kw)), f"GeckIt G {k}"))
        open(f"{out}/{k}-black.svg", "w").write(svg(fit(letter("#000", uid=k, **kw)), f"GeckIt G {k}, one colour"))
        open(f"{out}/{k}-small.svg", "w").write(svg(f'<rect width="256" height="256" rx="58" fill="{INK}"/>' + fit(letter(GR, uid=k + "s", **{**kw, "side": kw.get("side", 30) + 8, "top": kw.get("top", 19) + 6, "bar_h": kw.get("bar_h", 20) + 6, "stem_w": kw.get("stem_w", 30) + 6}), 0.82), f"GeckIt G {k}, small"))
    open(f"{out}/g0-xcharter.svg", "w").write(svg(r14.icon("green-on-ink"), "GeckIt G XCharter"))
    open(f"{out}/g0-xcharter-small.svg", "w").write(svg(r14.icon("green-on-ink", bold=14), "GeckIt G XCharter small"))
    open(f"{out}/g0-xcharter-black.svg", "w").write(svg(r14.g_path("#000"), "GeckIt G XCharter one colour"))
