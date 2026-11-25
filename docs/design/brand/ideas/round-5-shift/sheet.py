import base64
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "svg")
BO = os.path.join(HERE, "..", "round-4-breakout", "svg")
WORK = os.path.join(HERE, "work")
os.makedirs(WORK, exist_ok=True)
F = "Avenir Next"
INK, SUB, LINE = "#111418", "#555B63", "#E3E5E8"
SL, SD = "#FFFFFF", "#1A1D21"

SH = {k: os.path.join(SVG, f"shift{s}.svg") for k, s in (("main", ""), ("small", "-16"), ("mono", "-mono-black"), ("mono16", "-16-mono-black"), ("light", "-lockup-light"), ("dark", "-lockup-dark"))}
BR = {k: os.path.join(BO, f"breakout{s}.svg") for k, s in (("main", ""), ("small", "-16"), ("mono", "-mono-black"), ("mono16", "-16-mono-black"), ("light", "-lockup-light"), ("dark", "-lockup-dark"))}
n = [0]


def place(path, x, y, w, h):
    s = open(path).read()
    vb = re.search(r'viewBox="([^"]+)"', s).group(1)
    body = re.sub(r"^.*?<svg[^>]*>", "", s, flags=re.S)
    body = re.sub(r"</svg>\s*$", "", body)
    body = re.sub(r"<metadata.*?</metadata>|<sodipodi:namedview[^>]*/>|<title>.*?</title>", "", body, flags=re.S)
    return f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{vb}">{body}</svg>'


def text(x, y, s, size, color=INK, weight=500, anchor="start"):
    s = s.replace("&", "&amp;")
    return (f'<text x="{x}" y="{y}" font-family="{F}" font-size="{size}" font-weight="{weight}" '
            f'fill="{color}" text-anchor="{anchor}">{s}</text>')


def card(x, y, w, h, fill="#FFFFFF", stroke=LINE):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="{fill}" stroke="{stroke}"/>'


def pixels(src, size, bg, scale, x, y, label):
    n[0] += 1
    raw = os.path.join(WORK, f"px{n[0]}.png")
    subprocess.run(["rsvg-convert", "-w", str(size), "-b", bg, "-o", raw, src], check=True)
    big = os.path.join(WORK, f"px{n[0]}-big.png")
    subprocess.run(["magick", raw, "-filter", "point", "-resize", f"{scale * 100}%", big], check=True)
    uri = "data:image/png;base64," + base64.b64encode(open(big, "rb").read()).decode()
    side = size * scale
    return (f'<image x="{x}" y="{y}" width="{side}" height="{side}" href="{uri}" style="image-rendering:pixelated"/>'
            + text(x + side / 2, y + 108 + 20, label, 11, SUB, 600, "middle"))


def slack(x, y, w, dark):
    bg = SD if dark else SL
    ink = "#D1D2D3" if dark else "#1D1C1D"
    sub = "#9A9B9E" if dark else "#616061"
    edge = "#2C2F33" if dark else "#E3E3E3"
    hl = "#27242C" if dark else "#F6F6F6"
    o = [f'<rect x="{x}" y="{y}" width="{w}" height="256" rx="12" fill="{bg}" stroke="{edge}"/>']
    o.append(text(x + 16, y + 26, "Slack " + ("dark" if dark else "light") + ", real size: 36 / 24 / 16", 12, sub, 700))
    for i, (marks, name) in enumerate(((SH, "Shift"), (BR, "Breakout"))):
        yy = y + 44 + i * 104
        o.append(place(marks["main"], x + 16, yy, 36, 36))
        o.append(text(x + 64, yy + 15, "GeckIt", 15, ink, 700))
        o.append(text(x + 120, yy + 15, name, 12, sub, 600))
        o.append(text(x + 64, yy + 34, "Done. The board deck is in #leadership.", 14, ink, 400))
        o.append(place(marks["main"], x + 16, yy + 48, 24, 24))
        o.append(text(x + 50, yy + 65, "Investor update drafted.", 13, ink, 400))
        o.append(f'<rect x="{x+w-150}" y="{yy+46}" width="134" height="28" rx="6" fill="{hl}"/>')
        o.append(place(marks["small"], x + w - 140, yy + 52, 16, 16))
        o.append(text(x + w - 116, yy + 65, "GeckIt", 13, ink, 600))
    return "".join(o)


W = 1800
P = [""]
P.append(text(48, 62, "GeckIt  Shift: the task card leaves the column, next to Breakout", 32, INK, 700))
P.append(text(48, 96, "A square card in a board column speeds right, shears into a parallelogram and crosses the column edge: the task is done.", 18, SUB, 400))

y = 126
P.append(card(24, y, 1180, 440))
P.append(text(56, y + 40, "New: Shift", 22, INK, 700))
labels = ["1  In the column", "2  Moves right, shears", "3  Crosses the edge"]
for i in range(3):
    fx = 56 + i * 196
    P.append(place(os.path.join(SVG, f"shift-frame-{i+1}.svg"), fx, y + 60, 160, 160))
    P.append(text(fx, y + 246, labels[i], 14, INK, 600))
    if i < 2:
        P.append(text(fx + 178, y + 148, "→", 26, "#9AA39D", 500, "middle"))
P.append(text(56, y + 274, "Faint board, other cards and the left column edge appear only in these frames.", 13, SUB, 400))
P.append(place(SH["main"], 650, y + 56, 300, 300))
P.append(text(650, y + 386, "Static mark", 18, INK, 700))
P.append(text(650, y + 410, "shear and the broken edge carry the motion", 14, SUB, 400))
P.append(f'<rect x="980" y="{y+56}" width="190" height="190" rx="16" fill="#FFFFFF" stroke="{LINE}"/>')
P.append(place(SH["mono"], 985, y + 61, 180, 180))
P.append(text(980, y + 268, "One colour", 15, INK, 700))
P.append(place(SH["small"], 980, y + 290, 88, 88))
P.append(f'<rect x="1082" y="{y+290}" width="88" height="88" rx="12" fill="#FFFFFF" stroke="{LINE}"/>')
P.append(place(SH["mono16"], 1086, y + 294, 80, 80))
P.append(text(980, y + 404, "16 px cut: bigger card,", 13, SUB, 400))
P.append(text(980, y + 422, "heavier tick and edge", 13, SUB, 400))

P.append(card(1224, y, 552, 440))
P.append(text(1256, y + 40, "Current: Breakout", 22, INK, 700))
P.append(place(BR["main"], 1256, y + 56, 300, 300))
P.append(f'<rect x="1576" y="{y+56}" width="170" height="170" rx="16" fill="#FFFFFF" stroke="{LINE}"/>')
P.append(place(BR["mono"], 1581, y + 61, 160, 160))
P.append(place(BR["small"], 1576, y + 240, 80, 80))
P.append(f'<rect x="1666" y="{y+240}" width="80" height="80" rx="12" fill="#FFFFFF" stroke="{LINE}"/>')
P.append(place(BR["mono16"], 1670, y + 244, 72, 72))
P.append(text(1256, y + 386, "Static mark", 18, INK, 700))
P.append(text(1256, y + 410, "the tick itself breaks out of the box", 14, SUB, 400))

y = 590
P.append(card(24, y, W - 48, 200))
for i, (m, name) in enumerate(((SH, "Shift"), (BR, "Breakout"))):
    x = 48 + i * 870
    P.append(f'<rect x="{x}" y="{y+24}" width="420" height="150" rx="14" fill="#FFFFFF" stroke="{LINE}"/>')
    P.append(place(m["light"], x + 24, y + 51, 336, 96))
    P.append(f'<rect x="{x+432}" y="{y+24}" width="420" height="150" rx="14" fill="{SD}"/>')
    P.append(place(m["dark"], x + 456, y + 51, 336, 96))
    P.append(text(x, y + 194, name, 13, SUB, 700))

y = 814
P.append(card(24, y, W - 48, 362))
P.append(slack(48, y + 24, 520, False))
P.append(slack(584, y + 24, 520, True))
P.append(text(1128, y + 48, "True pixels, zoomed", 15, INK, 700))
cells = [(SH["main"], 16, SL, 5, "Shift 16 main"), (SH["small"], 16, SL, 5, "16 cut"), (SH["small"], 16, SD, 5, "16 cut dark"), (SH["mono16"], 16, SL, 5, "16 cut mono"),
         (SH["main"], 24, SD, 4, "Shift 24 dark"), (SH["main"], 36, SL, 3, "Shift 36"), (BR["small"], 16, SD, 5, "Breakout 16"), (BR["main"], 36, SD, 3, "Breakout 36")]
for j, (src, size, bg, sc, lab) in enumerate(cells):
    cx = 1128 + (j % 4) * 152
    cy = y + 62 + (j // 4) * 142
    P.append(pixels(src, size, bg, sc, cx, cy, lab))

y = 1200
P.append(card(24, y, W - 48, 200))
P.append(text(56, y + 40, "Where the motion reads, and where it is lost", 20, INK, 700))
notes = [
    "Reads: the three frames explain it at once; the static mark at 36 px and up shows the shear and the broken column edge.",
    "Reads at 24: card, tick and both edge stubs survive; the shear still reads as speed.",
    "Weak at 16: the main mark's tick and thin edge blur, so the 16 px cut uses a bigger card, a 38-unit tick and a 24-unit edge; it holds in colour, the one-colour tick gets soft.",
    "Lost without the frames: alone, the static mark can read as a ticket or a tag being stamped; 'task card on a board' needs the story or a board context once.",
    "Breakout reads 'done' faster at 16; Shift tells the 'card moves to Done' story better at large sizes.",
]
for i, t in enumerate(notes):
    P.append(text(56, y + 76 + i * 26, t, 14, SUB, 400))
H = y + 224
P[0] = f'<rect width="{W}" height="{H}" fill="#F3F4F5"/>'

doc = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(P)}</svg>'
path = os.path.join(WORK, "compare.svg")
open(path, "w").write(doc)
subprocess.run(["rsvg-convert", "-z", "2", "-o", os.path.join(HERE, "geckit-shift-vs-breakout.png"), path], check=True)
print("ok")
