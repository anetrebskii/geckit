import math, os
HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "svg")
INK, RED, WT = "#16191D", "#E5322D", "#FFFFFF"


def spiral(cx, cy, t0, t1, r0, r1, w0, w1, n=140):
    pts = []
    for i in range(n + 1):
        u = i / n
        t = math.radians(t0 + (t1 - t0) * u)
        r = r0 + (r1 - r0) * u
        pts.append((cx + r * math.cos(t), cy + r * math.sin(t), w0 + (w1 - w0) * u ** 1.6))
    return pts


def body(pts, col):
    return "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{w/2:.1f}" fill="{col}"/>' for x, y, w in pts)


def leg(x, y, ang, col, ln=26, w=11, pad=15):
    a = math.radians(ang)
    ex, ey = x + ln * math.cos(a), y + ln * math.sin(a)
    return (f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{ex:.1f}" y2="{ey:.1f}" stroke="{col}" stroke-width="{w}" stroke-linecap="round"/>'
            f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="{pad/2}" fill="{col}"/>')


def at_gecko(col, eye):
    cx, cy = 128, 128
    pts = []
    for i in range(121):
        u = i / 120
        a = math.radians(44 + (370 - 44) * u)
        pts.append((cx + 88 * math.cos(a), cy + 88 * math.sin(a), 30))
    sx, sy = pts[-1][0], pts[-1][1]
    ex, ey = cx + 36 * math.cos(math.radians(14)), cy + 36 * math.sin(math.radians(14))
    for i in range(1, 21):
        u = i / 20
        pts.append((sx + (ex - sx) * u, sy + (ey - sy) * u, 30 - 6 * u))
    for i in range(1, 121):
        u = i / 120
        a = math.radians(14 - 310 * u)
        r = 36 - 4 * u
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a), 24 - 18 * u ** 1.3))
    out = [body(pts, col)]
    ha = math.radians(38)
    hx, hy = cx + 90 * math.cos(ha), cy + 90 * math.sin(ha)
    head_dir = math.degrees(ha) - 90
    out.append(f'<ellipse cx="{hx:.1f}" cy="{hy:.1f}" rx="25" ry="19" fill="{col}" transform="rotate({head_dir:.1f} {hx:.1f} {hy:.1f})"/>')
    ox, oy = math.cos(ha), math.sin(ha)
    tx, ty = math.cos(math.radians(head_dir)), math.sin(math.radians(head_dir))
    for side in (-1, 1):
        ex2, ey2 = hx + tx * 6 + ox * side * 9, hy + ty * 6 + oy * side * 9
        out.append(f'<circle cx="{ex2:.1f}" cy="{ey2:.1f}" r="4.2" fill="{eye}"/>')
    for ang in (78, 300):
        a = math.radians(ang)
        x, y = cx + 88 * math.cos(a), cy + 88 * math.sin(a)
        out.append(leg(x, y, ang + 22, col, ln=30))
        out.append(leg(x, y, ang + 180 - 22, col, ln=22))
    return "".join(out)



def curl(col, eye):
    out = []
    pts = spiral(128, 128, -90, 230, 84, 70, 34, 8)
    out.append(body(pts, col))
    hx, hy = 128, 128 - 84
    out.append(f'<ellipse cx="{hx-6:.1f}" cy="{hy:.1f}" rx="26" ry="20" fill="{col}"/>')
    out.append(f'<circle cx="{hx-14:.1f}" cy="{hy-7:.1f}" r="5" fill="{eye}"/><circle cx="{hx-14:.1f}" cy="{hy+7:.1f}" r="5" fill="{eye}"/>')
    for i in (20, 70):
        x, y, w = pts[i]
        t = math.degrees(math.atan2(y - 128, x - 128))
        out.append(leg(x, y, t, col, ln=30))
        out.append(leg(x, y, t + 180, col, ln=24))
    return "".join(out)


def svg(body, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><title>{title}</title>{body}</svg>'


def tile(bg, art):
    return f'<rect width="256" height="256" rx="58" fill="{bg}"/><g transform="translate(128 128) scale(0.84) translate(-128 -128)">{art}</g>'


MARKS = {"a-at": ("геккон-упоминание", at_gecko), "b-curl": ("свернувшийся геккон", curl)}
for k, (t, fn) in MARKS.items():
    open(f"{SVG}/{k}.svg", "w").write(svg(tile(RED, fn(WT, RED)), f"GeckIt, {t}"))
    open(f"{SVG}/{k}-black.svg", "w").write(svg(fn("#000", "#FFF"), f"GeckIt, {t}, один цвет"))
    open(f"{SVG}/{k}-reversed.svg", "w").write(svg(f'<rect width="256" height="256" fill="{INK}"/>' + fn(WT, INK), f"GeckIt, {t}, выворотка"))
