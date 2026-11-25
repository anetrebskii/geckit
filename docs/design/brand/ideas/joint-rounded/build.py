import math, pathlib, subprocess
OUT = pathlib.Path(__file__).parent
W = OUT / "work"; W.mkdir(exist_ok=True)
INK, WT, GD, BG = "#16191D", "#FFFFFF", "#4AC85C", "#ECEDEF"
LEFT = [(14, 28), (68, 28), (68, 50), (47, 45), (47, 89), (68, 84), (68, 106), (14, 106)]
RIGHT = [(80, 18), (114, 18), (114, 89), (80, 89), (80, 74), (58, 79), (58, 56), (80, 61)]
OUTER = {(14, 28), (68, 28), (68, 106), (14, 106), (80, 18), (114, 18), (114, 89), (80, 89)}

def rounded(pts, ro, ri):
    n = len(pts); segs = []
    for i, v in enumerate(pts):
        a, b = pts[i - 1], pts[(i + 1) % n]
        r = ro if v in OUTER else ri
        la, lb = math.dist(v, a), math.dist(v, b)
        d = min(r, la / 2, lb / 2)
        p1 = (v[0] + (a[0] - v[0]) * d / la, v[1] + (a[1] - v[1]) * d / la)
        p2 = (v[0] + (b[0] - v[0]) * d / lb, v[1] + (b[1] - v[1]) * d / lb)
        c1 = (p1[0] + (v[0] - p1[0]) * 0.55, p1[1] + (v[1] - p1[1]) * 0.55)
        c2 = (p2[0] + (v[0] - p2[0]) * 0.55, p2[1] + (v[1] - p2[1]) * 0.55)
        segs.append((p1, c1, c2, p2))
    d = f"M{segs[0][3][0]:.2f} {segs[0][3][1]:.2f}"
    for p1, c1, c2, p2 in segs[1:] + segs[:1]:
        d += f"L{p1[0]:.2f} {p1[1]:.2f}C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p2[0]:.2f} {p2[1]:.2f}"
    return d + "Z"

ORIGINAL = ("M22 28H68V50L47 45V89L68 84V106H22Q14 106 14 98V36Q14 28 22 28Z", "M80 18H106Q114 18 114 26V81Q114 89 106 89H80V74L58 79V56L80 61Z")
VARIANTS = {"0-original": ORIGINAL}
for name, ro, ri in (("1-soft", 10, 2.5), ("2-round", 16, 4), ("3-pill", 22, 6)):
    VARIANTS[name] = (rounded(LEFT, ro, ri), rounded(RIGHT, ro, ri))

def icon(l, r, rx=29):
    k = 0.6 * 128 / 100
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>GeckIt</title><rect width="128" height="128" rx="{rx}" fill="{INK}"/>'
            f'<g transform="translate(64 64) scale({k:.4f}) translate(-64 -62)"><path d="{l}" fill="{WT}"/><path d="{r}" fill="{GD}"/></g></svg>')

def run(*a): subprocess.run(a, check=True)
rows = []
for name, (l, r) in VARIANTS.items():
    (OUT / f"{name}.svg").write_text(icon(l, r))
    cells = []
    for px in (360, 64, 32, 16):
        f = W / f"{name}-{px}.png"
        run("rsvg-convert", "-w", str(px), str(OUT / f"{name}.svg"), "-o", str(f))
        c = W / f"{name}-{px}c.png"
        run("magick", "-background", BG, str(f), "-gravity", "center", "-extent", f"{max(px + 30, 70)}x400", str(c)); cells.append(str(c))
    lab = W / f"{name}-lab.png"
    run("magick", "-background", BG, "-fill", "#444", "-font", "Helvetica", "-pointsize", "22", "-size", "160x400", "-gravity", "center", f"caption:{name}", str(lab))
    row = W / f"{name}-row.png"
    run("magick", "-background", BG, str(lab), *cells, "+append", str(row)); rows.append(str(row))
run("magick", "-background", BG, *rows, "-append", str(OUT / "joint-rounded.png"))
