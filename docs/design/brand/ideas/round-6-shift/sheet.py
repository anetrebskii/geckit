import base64
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "svg")
R5 = os.path.join(HERE, "..", "round-5-shift", "svg")
WORK = os.path.join(HERE, "work")
os.makedirs(WORK, exist_ok=True)
F = "Avenir Next"
INK, SUB, LINE = "#111418", "#555B63", "#E3E5E8"
SL, SD = "#FFFFFF", "#1A1D21"

COLS = [
    ("Shift with tick (round 5)", dict(main=os.path.join(R5, "shift.svg"), small=os.path.join(R5, "shift-16.svg"),
                                      light=os.path.join(R5, "shift-lockup-light.svg"), dark=os.path.join(R5, "shift-lockup-dark.svg"))),
    ("Shift, plain card (new)", dict(main=os.path.join(SVG, "shift-plain.svg"), small=os.path.join(SVG, "shift-plain-16.svg"),
                                    light=os.path.join(SVG, "shift-plain-lockup-light.svg"), dark=os.path.join(SVG, "shift-plain-lockup-dark.svg"))),
]
n = [0]


def place(path, x, y, w, h):
    s = open(path).read()
    vb = re.search(r'viewBox="([^"]+)"', s).group(1)
    body = re.sub(r"^.*?<svg[^>]*>", "", s, flags=re.S)
    body = re.sub(r"</svg>\s*$", "", body)
    body = re.sub(r"<metadata.*?</metadata>|<sodipodi:namedview[^>]*/>|<title>.*?</title>", "", body, flags=re.S)
    return f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{vb}">{body}</svg>'


def text(x, y, s, size, color=INK, weight=500, anchor="start"):
    return (f'<text x="{x}" y="{y}" font-family="{F}" font-size="{size}" font-weight="{weight}" '
            f'fill="{color}" text-anchor="{anchor}">{s}</text>')


def pixels(src, size, bg, scale, x, y):
    n[0] += 1
    raw = os.path.join(WORK, f"px{n[0]}.png")
    subprocess.run(["rsvg-convert", "-w", str(size), "-b", bg, "-o", raw, src], check=True)
    big = os.path.join(WORK, f"px{n[0]}-big.png")
    subprocess.run(["magick", raw, "-filter", "point", "-resize", f"{scale * 100}%", big], check=True)
    uri = "data:image/png;base64," + base64.b64encode(open(big, "rb").read()).decode()
    return f'<image x="{x}" y="{y}" width="{size*scale}" height="{size*scale}" href="{uri}" style="image-rendering:pixelated"/>'


def avatars(m, x, y, w, dark):
    bg = SD if dark else SL
    ink = "#D1D2D3" if dark else "#1D1C1D"
    sub = "#9A9B9E" if dark else "#616061"
    edge = "#2C2F33" if dark else "#E3E3E3"
    o = [f'<rect x="{x}" y="{y}" width="{w}" height="96" rx="12" fill="{bg}" stroke="{edge}"/>']
    o.append(place(m["main"], x + 20, y + 30, 36, 36))
    o.append(place(m["main"], x + 76, y + 36, 24, 24))
    o.append(place(m["small"], x + 120, y + 40, 16, 16))
    o.append(text(x + 38, y + 86, "36", 10, sub, 700, "middle"))
    o.append(text(x + 88, y + 86, "24", 10, sub, 700, "middle"))
    o.append(text(x + 128, y + 86, "16", 10, sub, 700, "middle"))
    o.append(text(x + 160, y + 44, "GeckIt", 14, ink, 700))
    o.append(text(x + 160, y + 64, "Done. The board deck is ready.", 13, ink, 400))
    o.append(pixels(m["small"], 16, bg, 4, x + w - 80, y + 16))
    o.append(text(x + w - 48, y + 92, "16 px x4", 9, sub, 700, "middle"))
    return "".join(o)


W, CW = 1440, 692
P = [""]
P.append(text(40, 56, "GeckIt  Shift: with the tick or without it", 30, INK, 700))
P.append(text(40, 86, "Static marks only, no motion story. Graphite and lime, same column edge.", 16, SUB, 400))
for i, (name, m) in enumerate(COLS):
    x = 24 + i * (CW + 8)
    y = 110
    P.append(f'<rect x="{x}" y="{y}" width="{CW}" height="620" rx="18" fill="#FFFFFF" stroke="{"#111418" if i else LINE}" stroke-width="{2 if i else 1}"/>')
    P.append(text(x + 28, y + 40, name, 20, INK, 700))
    P.append(place(m["main"], x + 28, y + 60, 220, 220))
    P.append(f'<rect x="{x+272}" y="{y+60}" width="392" height="104" rx="12" fill="#FFFFFF" stroke="{LINE}"/>')
    P.append(place(m["light"], x + 292, y + 72, 294, 84))
    P.append(f'<rect x="{x+272}" y="{y+176}" width="392" height="104" rx="12" fill="{SD}"/>')
    P.append(place(m["dark"], x + 292, y + 188, 294, 84))
    P.append(text(x + 28, y + 318, "Avatars, real size", 14, INK, 700))
    P.append(avatars(m, x + 28, y + 332, CW - 56, False))
    P.append(avatars(m, x + 28, y + 440, CW - 56, True))
    if i:
        P.append(text(x + 28, y + 572, "Change after removing the tick: card 144 x 80 (was 138 x 96), gap at the edge 12 (was 10).", 13, SUB, 500))
        P.append(text(x + 28, y + 594, "16 px uses a bigger card and a 22-unit edge.", 13, SUB, 500))
    else:
        P.append(text(x + 28, y + 572, "Round 5 mark, unchanged.", 13, SUB, 500))
H = 110 + 620 + 30
P[0] = f'<rect width="{W}" height="{H}" fill="#F3F4F5"/>'
doc = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(P)}</svg>'
path = os.path.join(WORK, "compare.svg")
open(path, "w").write(doc)
subprocess.run(["rsvg-convert", "-z", "2", "-o", os.path.join(HERE, "geckit-shift-tick-vs-plain.png"), path], check=True)
print("ok")
