import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "svg")
os.makedirs(OUT, exist_ok=True)

TILE_R = 58


def pt(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def taper(x, y, deg, length, turn, w0, w1, n=160):
    a = -turn * 2 / length ** 2
    th = math.radians(deg)
    pts = []
    ds = length / n
    for i in range(n + 1):
        s = i * ds
        w = (w0 + (w1 - w0) * (s / length) ** 1.3) / 2
        pts.append((x, y, th, w))
        th += a * s * ds
        x += math.cos(th) * ds
        y += math.sin(th) * ds
    left = [(px - math.sin(t) * w, py + math.cos(t) * w) for px, py, t, w in pts]
    right = [(px + math.sin(t) * w, py - math.cos(t) * w) for px, py, t, w in pts]
    ex, ey, et, ew = pts[-1]
    d = "M" + " L".join(f"{p[0]:.2f} {p[1]:.2f}" for p in left)
    d += f" A{ew:.2f} {ew:.2f} 0 0 0 {right[-1][0]:.2f} {right[-1][1]:.2f}"
    d += " L" + " L".join(f"{p[0]:.2f} {p[1]:.2f}" for p in reversed(right)) + " Z"
    return d


def mark_a():
    legs = []
    for s in (-1, 1):
        legs.append(f'<path d="M{10*s} -30 L{38*s} -40 L{44*s} -62" />')
        legs.append(f'<path d="M{10*s} 20 L{38*s} 30 L{40*s} 54" />')
    feet = "".join(f'<circle cx="{x}" cy="{y}" r="12"/>' for s in (-1, 1) for x, y in ((45 * s, -64), (41 * s, 57)))
    body = (
        '<ellipse cx="0" cy="-66" rx="25" ry="28"/>'
        '<rect x="-19" y="-56" width="38" height="92" rx="19"/>'
        '<path d="M-19 20 C-17 66 -6 96 0 118 C6 96 17 66 19 20 Z"/>'
    )
    return (
        '<g transform="translate(130 126) rotate(45)">'
        f'{body}{feet}<g fill="none" stroke="currentColor" stroke-width="15" stroke-linecap="round" stroke-linejoin="round">{"".join(legs)}</g>'
        '</g>'
    )


def mark_b():
    cx, cy, r, w = 108, 128, 66, 40
    x1, y1 = pt(cx, cy, r, -46)
    x2, y2 = pt(cx, cy, r, 0)
    arc = f'M{x1:.1f} {y1:.1f} A{r} {r} 0 1 0 {x2:.1f} {y2:.1f}'
    ex, ey = cx + r + 42, cy - 6
    return (
        f'<g fill="none" stroke="currentColor" stroke-width="{w}" stroke-linecap="round">'
        f'<path d="{arc}"/><path d="M{cx+6} {cy} L{cx+r+52} {cy}"/></g>'
        f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="6.5" fill="var(--bg)"/>'
    )


def mark_c():
    tail = taper(158, 118, -50, 150, 5.4, 36, 10)
    return '<g transform="translate(10 -4)">' + (
        '<g fill="none" stroke="currentColor" stroke-width="36" stroke-linecap="round" stroke-linejoin="round">'
        '<path d="M44 152 L88 196 L160 116"/></g>'
        f'<path d="{tail}"/>'
        ) + '</g>'


CONCEPTS = [
    dict(key="a", name="Dart", mark=mark_a, tile="#16A34A", fg="#FFFFFF",
         font="Avenir Next", weight="800", style="normal", spacing="-2"),
    dict(key="b", name="Curl G", mark=mark_b, tile="#0D2A1C", fg="#4ADE80",
         font="Avenir Next", weight="700", style="normal", spacing="-1"),
    dict(key="c", name="Tick Tail", mark=mark_c, tile="#16A34A", fg="#FFFFFF",
         font="Avenir Next", weight="600", style="normal", spacing="0"),
]


def tile(c, size=256, x=0, y=0):
    s = size / 256
    return (
        f'<g transform="translate({x} {y}) scale({s})" color="{c["fg"]}" fill="{c["fg"]}" style="--bg:{c["tile"]}">'
        f'<rect width="256" height="256" rx="{TILE_R}" fill="{c["tile"]}"/>'
        f'{c["mark"]().replace("var(--bg)", c["tile"])}</g>'
    )


def write(path, body, w, h):
    with open(path, "w") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{body}</svg>')


def word(c, x, y, size, color):
    return (
        f'<text x="{x}" y="{y}" font-family="{c["font"]}" font-weight="{c["weight"]}" font-style="{c["style"]}" '
        f'font-size="{size}" letter-spacing="{c["spacing"]}" fill="{color}">GeckIt</text>'
    )


def outline(src, dst):
    subprocess.run(["inkscape", src, "--export-text-to-path", "--export-plain-svg", f"--export-filename={dst}"],
                   check=True, capture_output=True)


for c in CONCEPTS:
    write(os.path.join(OUT, f'{c["key"]}-symbol.svg'), tile(c), 256, 256)
    mono = c["mark"]().replace("var(--bg)", "#FFFFFF")
    write(os.path.join(OUT, f'{c["key"]}-mark-black.svg'), f'<g color="#000" fill="#000">{mono}</g>', 256, 256)
    for theme, ink in (("light", "#0B1510"), ("dark", "#F4F7F5")):
        raw = os.path.join(OUT, f'{c["key"]}-lockup-{theme}.raw.svg')
        write(raw, tile(c, 112, 0, 4) + word(c, 136, 88, 76, ink), 400, 120)
        outline(raw, os.path.join(OUT, f'{c["key"]}-lockup-{theme}.svg'))
        os.remove(raw)

print("ok")
