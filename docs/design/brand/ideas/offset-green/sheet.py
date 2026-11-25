import base64
import os
import re
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
R7 = os.path.join(HERE, "..", "round-7-shift", "svg")
SVG = os.path.join(HERE, "svg")
WORK = os.path.join(HERE, "work")
os.makedirs(SVG, exist_ok=True)
os.makedirs(WORK, exist_ok=True)
F = "Avenir Next"
INK, SUB, LINE, BG = "#111418", "#555B63", "#E3E5E8", "#F3F4F5"
SL, SD = "#FFFFFF", "#1A1D21"
GREEN = "#4AC85C"

for n in ("offset.svg", "offset-lockup-light.svg", "offset-lockup-dark.svg"):
    shutil.copy(os.path.join(R7, n), os.path.join(SVG, n.replace("offset", "offset-lime")))
    s = open(os.path.join(R7, n)).read()
    s = re.sub("#C8F135", GREEN, s, flags=re.I).replace("GeckIt Shift, offset", "GeckIt Offset, app green")
    open(os.path.join(SVG, n.replace("offset", "offset-green")), "w").write(s)

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


def pixels(src, size, bg, scale, x, y):
    n[0] += 1
    raw = os.path.join(WORK, f"px{n[0]}.png")
    subprocess.run(["rsvg-convert", "-w", str(size), "-b", bg, "-o", raw, src], check=True)
    big = os.path.join(WORK, f"px{n[0]}-big.png")
    subprocess.run(["magick", raw, "-filter", "point", "-resize", f"{scale * 100}%", big], check=True)
    uri = "data:image/png;base64," + base64.b64encode(open(big, "rb").read()).decode()
    return f'<image x="{x}" y="{y}" width="{size*scale}" height="{size*scale}" href="{uri}" style="image-rendering:pixelated"/>'


def slack(m, x, y, w, dark):
    bg = SD if dark else SL
    ink = "#D1D2D3" if dark else "#1D1C1D"
    sub = "#9A9B9E" if dark else "#616061"
    edge = "#2C2F33" if dark else "#E3E3E3"
    hl = "#27242C" if dark else "#F6F6F6"
    o = [f'<rect x="{x}" y="{y}" width="{w}" height="150" rx="12" fill="{bg}" stroke="{edge}"/>']
    o.append(place(m, x + 16, y + 16, 36, 36))
    o.append(text(x + 64, y + 32, "GeckIt", 15, ink, 700))
    o.append(text(x + 64, y + 50, "Done. Ready to paste:", 14, ink, 400))
    o.append(place(m, x + 16, y + 68, 24, 24))
    o.append(text(x + 50, y + 85, "GeckIt", 14, ink, 700))
    o.append(f'<rect x="{x+8}" y="{y+106}" width="{w-16}" height="30" rx="6" fill="{hl}"/>')
    o.append(place(m, x + 20, y + 113, 16, 16))
    o.append(text(x + 46, y + 126, "GeckIt", 14, ink, 600))
    o.append(text(x + w - 16, y + 32, "36", 11, sub, 700, "end"))
    o.append(text(x + w - 16, y + 85, "24", 11, sub, 700, "end"))
    o.append(text(x + w - 16, y + 126, "16", 11, sub, 700, "end"))
    return "".join(o)


W = 1200
CW = 568
P = [""]
P.append(text(32, 52, "GeckIt Offset: lime or the app green", 28, INK, 700))
P.append(text(32, 80, "Same geometry. Only the moved bar changes colour. Green is the app accent #4AC85C.", 15, SUB, 400))
cols = [("Lime #C8F135 (round 7)", "offset-lime"), ("App green #4AC85C", "offset-green")]
for i, (name, k) in enumerate(cols):
    x = 24 + i * (CW + 16)
    y = 100
    P.append(f'<rect x="{x}" y="{y}" width="{CW}" height="720" rx="18" fill="#FFFFFF" stroke="{LINE}"/>')
    P.append(text(x + 24, y + 38, name, 20, INK, 700))
    P.append(place(S(f"{k}.svg"), x + 24, y + 58, 180, 180))
    P.append(f'<rect x="{x+224}" y="{y+58}" width="320" height="86" rx="12" fill="#FFFFFF" stroke="{LINE}"/>')
    P.append(place(S(f"{k}-lockup-light.svg"), x + 240, y + 68, 231, 66))
    P.append(f'<rect x="{x+224}" y="{y+152}" width="320" height="86" rx="12" fill="{SD}"/>')
    P.append(place(S(f"{k}-lockup-dark.svg"), x + 240, y + 162, 231, 66))
    P.append(text(x + 24, y + 274, "Slack, real size", 14, INK, 700))
    P.append(slack(S(f"{k}.svg"), x + 24, y + 288, 252, False))
    P.append(slack(S(f"{k}.svg"), x + 292, y + 288, 252, True))
    P.append(text(x + 24, y + 474, "True pixels, zoomed", 14, INK, 700))
    cells = [(16, SL, 6, "16 light"), (16, SD, 6, "16 dark"), (24, SD, 4, "24 dark"), (36, SL, 3, "36 light")]
    for j, (size, bg, sc, lab) in enumerate(cells):
        cx = x + 24 + j * 132
        P.append(pixels(S(f"{k}.svg"), size, bg, sc, cx, y + 488))
        P.append(text(cx + 54, y + 620, lab, 12, SUB, 600, "middle"))
    P.append(f'<rect x="{x+24}" y="{y+640}" width="520" height="56" rx="12" fill="#16191D"/>')
    sw = "#C8F135" if i == 0 else GREEN
    P.append(f'<rect x="{x+40}" y="{y+656}" width="24" height="24" rx="6" fill="{sw}"/>')
    P.append(f'<rect x="{x+72}" y="{y+656}" width="24" height="24" rx="6" fill="#FFFFFF"/>')
    note = "13.5:1 on the tile, 1.3:1 against the white bar" if i == 0 else "8.2:1 on the tile, 2.2:1 against the white bar"
    P.append(text(x + 110, y + 673, note, 14, "#E6E8EA", 500))
H = 100 + 720 + 24
P[0] = f'<rect width="{W}" height="{H}" fill="{BG}"/>'
doc = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(P)}</svg>'
path = os.path.join(WORK, "sheet.svg")
open(path, "w").write(doc)
subprocess.run(["rsvg-convert", "-z", "2", "-o", os.path.join(HERE, "geckit-offset-lime-vs-green.png"), path], check=True)
shutil.rmtree(WORK)
print("ok")
