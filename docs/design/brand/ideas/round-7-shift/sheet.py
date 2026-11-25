import base64
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "svg")
WORK = os.path.join(HERE, "work")
os.makedirs(WORK, exist_ok=True)
F = "Avenir Next"
INK, SUB, LINE = "#111418", "#555B63", "#E3E5E8"
SL, SD = "#FFFFFF", "#1A1D21"
S = lambda n: os.path.join(SVG, n)
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


def pixels(src, size, bg, scale, x, y, label, base):
    n[0] += 1
    raw = os.path.join(WORK, f"px{n[0]}.png")
    subprocess.run(["rsvg-convert", "-w", str(size), "-b", bg, "-o", raw, src], check=True)
    big = os.path.join(WORK, f"px{n[0]}-big.png")
    subprocess.run(["magick", raw, "-filter", "point", "-resize", f"{scale * 100}%", big], check=True)
    uri = "data:image/png;base64," + base64.b64encode(open(big, "rb").read()).decode()
    side = size * scale
    return (f'<image x="{x}" y="{y}" width="{side}" height="{side}" href="{uri}" style="image-rendering:pixelated"/>'
            + text(x + side / 2, base, label, 11, SUB, 600, "middle"))


def slack(x, y, w, dark):
    bg = SD if dark else SL
    ink = "#D1D2D3" if dark else "#1D1C1D"
    sub = "#9A9B9E" if dark else "#616061"
    edge = "#2C2F33" if dark else "#E3E3E3"
    hl = "#27242C" if dark else "#F6F6F6"
    m = S("offset.svg")
    o = [f'<rect x="{x}" y="{y}" width="{w}" height="212" rx="12" fill="{bg}" stroke="{edge}"/>']
    o.append(text(x + 16, y + 26, "Slack " + ("dark" if dark else "light") + ", real size", 12, sub, 700))
    o.append(place(m, x + 16, y + 42, 36, 36))
    o.append(text(x + 64, y + 58, "GeckIt", 15, ink, 700))
    o.append(f'<rect x="{x+118}" y="{y+46}" width="30" height="15" rx="3" fill="{edge}"/>')
    o.append(text(x + 133, y + 57.5, "APP", 9, sub, 700, "middle"))
    o.append(text(x + 64, y + 78, "Done. The board deck is in #leadership.", 14, ink, 400))
    o.append(text(x + w - 16, y + 58, "36", 11, sub, 700, "end"))
    o.append(place(m, x + 16, y + 106, 24, 24))
    o.append(text(x + 50, y + 123, "GeckIt", 14, ink, 700))
    o.append(text(x + 104, y + 123, "Investor update drafted.", 13, ink, 400))
    o.append(text(x + w - 16, y + 123, "24", 11, sub, 700, "end"))
    o.append(f'<rect x="{x+8}" y="{y+156}" width="{w-16}" height="30" rx="6" fill="{hl}"/>')
    o.append(place(m, x + 20, y + 163, 16, 16))
    o.append(text(x + 46, y + 176, "GeckIt", 14, ink, 600))
    o.append(text(x + w - 16, y + 176, "16, sidebar", 11, sub, 700, "end"))
    return "".join(o)


W = 1800
P = [""]
P.append(text(48, 62, "GeckIt  Shift, round 7", 34, INK, 700))
P.append(text(48, 96, "Do it, but quickly: one sharp shift. Lime is the part that has already moved.", 18, SUB, 400))

y = 126
P.append(f'<rect x="24" y="{y}" width="1140" height="470" rx="18" fill="#FFFFFF" stroke="#111418" stroke-width="2"/>')
P.append(text(56, y + 42, "Leader: Offset", 22, INK, 700))
P.append(text(56, y + 68, "A plain block split in two; the top half has already jumped ahead and leans into the move.", 15, SUB, 400))
P.append(place(S("offset.svg"), 56, y + 92, 340, 340))
P.append(f'<rect x="424" y="{y+92}" width="150" height="150" rx="16" fill="#FFFFFF" stroke="{LINE}"/>')
P.append(place(S("offset-mono-black.svg"), 429, y + 97, 140, 140))
P.append(text(424, y + 266, "One colour", 14, INK, 700))
P.append(f'<rect x="596" y="{y+92}" width="540" height="160" rx="14" fill="#FFFFFF" stroke="{LINE}"/>')
P.append(place(S("offset-lockup-light.svg"), 626, y + 116, 392, 112))
P.append(f'<rect x="596" y="{y+272}" width="540" height="160" rx="14" fill="{SD}"/>')
P.append(place(S("offset-lockup-dark.svg"), 626, y + 296, 392, 112))

P.append(f'<rect x="1184" y="{y}" width="592" height="470" rx="18" fill="#FFFFFF" stroke="{LINE}"/>')
P.append(text(1216, y + 42, "Alternatives", 22, INK, 700))
alts = [("slice", "Slice", "a block breaks in two; the front half leans"), ("through", "Through", "a bar slips out sideways; reads more as a plug")]
for i, (k, name, note) in enumerate(alts):
    yy = y + 70 + i * 196
    P.append(place(S(f"{k}.svg"), 1216, yy, 160, 160))
    P.append(f'<rect x="1394" y="{yy}" width="160" height="160" rx="16" fill="#FFFFFF" stroke="{LINE}"/>')
    P.append(place(S(f"{k}-mono-black.svg"), 1399, yy + 5, 150, 150))
    P.append(text(1576, yy + 70, name, 18, INK, 700))
    words = note.split("; ")
    for j, w in enumerate(words):
        P.append(text(1576, yy + 96 + j * 20, w, 13, SUB, 400))

y = 620
P.append(f'<rect x="24" y="{y}" width="{W-48}" height="270" rx="18" fill="#FFFFFF" stroke="{LINE}"/>')
P.append(slack(48, y + 28, 470, False))
P.append(slack(534, y + 28, 470, True))
P.append(text(1030, y + 52, "Leader, true pixels zoomed", 15, INK, 700))
base = y + 70 + 108 + 22
cells = [(S("offset.svg"), 16, SL, 6, "16 light"), (S("offset.svg"), 16, SD, 6, "16 dark"), (S("offset-mono-black.svg"), 16, SL, 6, "16 mono"),
         (S("offset.svg"), 24, SD, 4, "24 dark"), (S("offset.svg"), 36, SL, 3, "36 light")]
for j, (src, size, bg, sc, lab) in enumerate(cells):
    P.append(pixels(src, size, bg, sc, 1030 + j * 146, y + 70, lab, base))
H = y + 294
P[0] = f'<rect width="{W}" height="{H}" fill="#F3F4F5"/>'
doc = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(P)}</svg>'
path = os.path.join(WORK, "sheet.svg")
open(path, "w").write(doc)
subprocess.run(["rsvg-convert", "-z", "2", "-o", os.path.join(HERE, "geckit-shift-round-7.png"), path], check=True)
print("ok")
