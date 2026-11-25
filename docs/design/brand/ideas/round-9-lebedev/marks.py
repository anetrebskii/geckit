import math, os
HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "svg")
GR, INK, WT = "#3DB453", "#16191D", "#FFFFFF"


def toe(cx, cy, ang, length, w, pw, ph, col):
    a = math.radians(ang)
    ex, ey = cx + length * math.sin(a), cy - length * math.cos(a)
    return (f'<line x1="{cx:.1f}" y1="{cy:.1f}" x2="{ex:.1f}" y2="{ey:.1f}" stroke="{col}" stroke-width="{w}" stroke-linecap="round"/>'
            f'<ellipse cx="{ex:.1f}" cy="{ey:.1f}" rx="{pw/2}" ry="{ph/2}" fill="{col}" transform="rotate({ang} {ex:.1f} {ey:.1f})"/>')


def paddle(cx, cy, ang, length, w0, w1, col):
    a = math.radians(ang)
    ux, uy = math.sin(a), -math.cos(a)
    px, py = -uy, ux
    ex, ey = cx + ux * (length - w1 / 2), cy + uy * (length - w1 / 2)
    pts = [(cx + px * w0 / 2, cy + py * w0 / 2), (ex + px * w1 / 2, ey + py * w1 / 2)]
    d = f"M{pts[0][0]:.1f} {pts[0][1]:.1f} L{pts[1][0]:.1f} {pts[1][1]:.1f} A{w1/2} {w1/2} 0 0 0 {ex - px * w1 / 2:.1f} {ey - py * w1 / 2:.1f} L{cx - px * w0 / 2:.1f} {cy - py * w0 / 2:.1f} Z"
    return f'<path d="{d}" fill="{col}"/>'


def pad(cx, cy, ang, length, w0, pw, ph, col):
    a = math.radians(ang)
    ux, uy = math.sin(a), -math.cos(a)
    ex, ey = cx + ux * length, cy + uy * length
    return (f'<line x1="{cx:.1f}" y1="{cy:.1f}" x2="{ex:.1f}" y2="{ey:.1f}" stroke="{col}" stroke-width="{w0}" stroke-linecap="round"/>'
            f'<ellipse cx="{ex:.1f}" cy="{ey:.1f}" rx="{pw/2}" ry="{ph/2}" fill="{col}" transform="rotate({ang:.1f} {ex:.1f} {ey:.1f})"/>')


def foot(col, cx=150, cy=116, turn=40, spread=(-86, -43, 0, 43, 86), lens=(78, 90, 94, 90, 78)):
    a = math.radians(turn + 180)
    bx, by = cx + 260 * math.sin(a), cy - 260 * math.cos(a)
    out = [f'<line x1="{cx}" y1="{cy}" x2="{bx:.1f}" y2="{by:.1f}" stroke="{col}" stroke-width="64" stroke-linecap="round"/>',
           f'<circle cx="{cx}" cy="{cy}" r="40" fill="{col}"/>']
    for d, l in zip(spread, lens):
        out.append(paddle(cx, cy, turn + d, l, 22, 44, col))
    return "".join(out)



def edge(col):
    head = f'<path d="M128 34 C 150 34 168 54 170 82 C 172 104 160 122 128 126 C 96 122 84 104 86 82 C 88 54 106 34 128 34 Z" fill="{col}"/>'
    body = f'<rect x="100" y="104" width="56" height="220" rx="28" fill="{col}"/>'
    out = [head, body]
    for sx in (-1, 1):
        out.append(f'<path d="M128 150 L{128+sx*66} 168 L{128+sx*78} 116" fill="none" stroke="{col}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>')
        for a in (-70, -24, 22, 68):
            out.append(paddle(128 + sx * 78, 116, a, 40, 10, 20, col))
    return "".join(out)


def whole(col):
    out = [f'<path d="M128 70 L128 172 C 128 212 158 224 182 206" fill="none" stroke="{col}" stroke-width="30" stroke-linecap="round"/>',
           f'<ellipse cx="128" cy="64" rx="30" ry="36" fill="{col}"/>']
    for sx in (-1, 1):
        for y0, ky, fy, base in ((104, 104, 70, 0), (160, 160, 194, 180)):
            fx = 128 + sx * 70
            out.append(f'<path d="M128 {y0} L{128+sx*58} {ky} L{fx} {fy}" fill="none" stroke="{col}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>')
            for a in (-60, -10, 40):
                out.append(paddle(fx, fy, base + (a + 10) * sx * (1 if base == 0 else -1), 30, 8, 16, col))
    return "".join(out)

def tile(art, bg=GR):
    return f'<defs><clipPath id="t"><rect width="256" height="256" rx="58"/></clipPath></defs><g clip-path="url(#t)"><rect width="256" height="256" fill="{bg}"/>{art}</g>'


def free(art):
    return f'<defs><clipPath id="t"><rect width="256" height="256"/></clipPath></defs><g clip-path="url(#t)">{art}</g>'


def svg(body, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><title>{title}</title>{body}</svg>'


MARKS = {
    "a-foot": ("GeckIt, лапа", lambda c: foot(c)),
    "b-edge": ("GeckIt, из-за края", lambda c: edge(c)),
    "c-whole": ("GeckIt, весь геккон", lambda c: whole(c)),
}
if __name__ == "__main__":
    os.makedirs(SVG, exist_ok=True)
    for k, (t, fn) in MARKS.items():
        open(os.path.join(SVG, f"{k}.svg"), "w").write(svg(tile(fn(WT)), t))
        open(os.path.join(SVG, f"{k}-black.svg"), "w").write(svg(free(fn("#000")), t + ", один цвет"))
        open(os.path.join(SVG, f"{k}-reversed.svg"), "w").write(svg(f'<rect width="256" height="256" fill="{INK}"/>' + free(fn(WT)), t + ", выворотка"))
