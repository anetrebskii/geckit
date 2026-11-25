import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "svg")
F = "Avenir Next"

CONCEPTS = [
    ("a", "A", "Dart", "The gecko redrawn mid-sprint, pointed like an arrow.",
     "Speed: a body built as a forward arrow. Keeps today's green gecko.",
     "Risk: at 16 px it turns into a blob; the most literal of the three."),
    ("b", "B", "Curl G", "A G whose bar breaks out of the letter: the gecko darts off.",
     "Speed: the task leaves the curl before the circle closes.",
     "Risk: G monograms are common; the eye is the ownable detail."),
    ("c", "C", "Tick Tail", "A check mark whose stroke ends in a gecko's tail curl.",
     "Speed: 'done' is the whole sign, the curl says who did it.",
     "Risk: checks are the task-app cliche; the curl can read as '?'."),
]
RECOMMEND = "b"
SLACK_LIGHT, SLACK_DARK = "#FFFFFF", "#1A1D21"


def inner(path):
    s = open(path).read()
    vb = re.search(r'viewBox="([^"]+)"', s).group(1)
    body = re.sub(r"^.*?<svg[^>]*>", "", s, flags=re.S)
    body = re.sub(r"</svg>\s*$", "", body)
    body = re.sub(r"<metadata.*?</metadata>|<sodipodi:namedview[^>]*/>|<defs[^>]*/>", "", body, flags=re.S)
    return vb, body


def place(path, x, y, w, h):
    vb, body = inner(path)
    return f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{vb}">{body}</svg>'


def text(x, y, s, size, color, weight=500, anchor="start"):
    s = s.replace("&", "&amp;")
    return (f'<text x="{x}" y="{y}" font-family="{F}" font-size="{size}" font-weight="{weight}" '
            f'fill="{color}" text-anchor="{anchor}">{s}</text>')


def slack_row(key, x, y, w, dark):
    bg = SLACK_DARK if dark else SLACK_LIGHT
    ink = "#D1D2D3" if dark else "#1D1C1D"
    sub = "#9A9B9E" if dark else "#616061"
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="64" rx="10" fill="{bg}" stroke="{"#2C2F33" if dark else "#E3E3E3"}"/>']
    out.append(place(os.path.join(SVG, f"{key}-symbol.svg"), x + 14, y + 14, 36, 36))
    out.append(text(x + 62, y + 30, "GeckIt", 15, ink, 700))
    out.append(f'<rect x="{x+116}" y="{y+18}" width="30" height="15" rx="3" fill="{"#2C2F33" if dark else "#EBEBEB"}"/>')
    out.append(text(x + 131, y + 29.5, "APP", 9, sub, 700, "middle"))
    out.append(text(x + 154, y + 30, "9:41 AM", 12, sub))
    out.append(text(x + 62, y + 50, "Done. The board deck is in #leadership.", 14, ink, 400))
    return "".join(out)


def small_strip(key, x, y, dark):
    bg = SLACK_DARK if dark else "#F4F4F4"
    out = [f'<rect x="{x}" y="{y}" width="96" height="64" rx="10" fill="{bg}"/>']
    out.append(place(os.path.join(SVG, f"{key}-symbol.svg"), x + 14, y + 20, 24, 24))
    out.append(place(os.path.join(SVG, f"{key}-symbol.svg"), x + 56, y + 24, 16, 16))
    return "".join(out)


W, ROW, TOP = 1800, 300, 150
H = TOP + ROW * 3 + 70
parts = [f'<rect width="{W}" height="{H}" fill="#F2F3F1"/>']
parts.append(text(48, 66, "GeckIt logo concepts", 36, "#0B1510", 700))
parts.append(text(48, 104, "AI employee for Slack. Idea: get it done, fast ('GeckIt' = do it, but quickly). Sketches for choosing, not final assets.", 18, "#4A524D", 400))
parts.append(text(800, 138, "Lockup on light", 14, "#6B736E", 600, "middle"))
parts.append(text(1160, 138, "Lockup on dark", 14, "#6B736E", 600, "middle"))
parts.append(text(1530, 138, "Slack avatar, real 36 / 24 / 16 pt", 14, "#6B736E", 600, "middle"))

for i, (key, letter, name, idea, speed, risk) in enumerate(CONCEPTS):
    y = TOP + i * ROW
    rec = key == RECOMMEND
    parts.append(f'<rect x="24" y="{y}" width="{W-48}" height="{ROW-20}" rx="18" fill="#FFFFFF" '
                 f'stroke="{"#16A34A" if rec else "#E2E5E1"}" stroke-width="{3 if rec else 1}"/>')
    parts.append(place(os.path.join(SVG, f"{key}-symbol.svg"), 48, y + 24, 160, 160))
    parts.append(text(232, y + 58, f"{letter}  {name}", 30, "#0B1510", 700))
    if rec:
        parts.append(f'<rect x="{232}" y="{y+76}" width="170" height="28" rx="14" fill="#16A34A"/>')
        parts.append(text(317, y + 95, "Recommended", 15, "#FFFFFF", 700, "middle"))
    for j, line in enumerate((idea, speed, risk)):
        parts.append(text(48, y + 214 + j * 24, line, 16, "#0B1510" if j == 0 else "#4A524D", 600 if j == 0 else 400))
    parts.append(f'<rect x="610" y="{y+24}" width="380" height="160" rx="14" fill="#FFFFFF" stroke="#E2E5E1"/>')
    parts.append(place(os.path.join(SVG, f"{key}-lockup-light.svg"), 640, y + 64, 320, 96))
    parts.append(f'<rect x="1000" y="{y+24}" width="380" height="160" rx="14" fill="{SLACK_DARK}"/>')
    parts.append(place(os.path.join(SVG, f"{key}-lockup-dark.svg"), 1030, y + 64, 320, 96))
    parts.append(slack_row(key, 1392, y + 24, 376, False))
    parts.append(slack_row(key, 1392, y + 96, 376, True))
    parts.append(small_strip(key, 1392, y + 168, False))
    parts.append(small_strip(key, 1496, y + 168, True))

parts.append(text(48, H - 30, "Greens: today's app green kept as equity. Wordmarks set in Avenir Next and outlined for the sketch; final type to be drawn. No trademark search done.", 15, "#6B736E", 400))

svg_path = os.path.join(HERE, "geckit-logo-concepts.svg")
with open(svg_path, "w") as f:
    f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(parts)}</svg>')
subprocess.run(["rsvg-convert", "-z", "2", "-o", os.path.join(HERE, "geckit-logo-concepts.png"), svg_path], check=True)
print("ok")
