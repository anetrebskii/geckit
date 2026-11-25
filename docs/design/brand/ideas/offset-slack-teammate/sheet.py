import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "svg")
WORK = os.path.join(HERE, "work")
os.makedirs(WORK, exist_ok=True)
F = "Avenir Next"
INK, SUB, LINE, BG = "#111418", "#555B63", "#E3E5E8", "#F3F4F5"
SK, SKS, LINK, MBG = "#1D1C1D", "#616061", "#1264A3", "#E8F5FA"
LIME, G = "#C8F135", "#16191D"
S = lambda n: os.path.join(SVG, n)


def place(path, x, y, w, h):
    s = open(path).read()
    vb = re.search(r'viewBox="([^"]+)"', s).group(1)
    body = re.sub(r"^.*?<svg[^>]*>", "", s, flags=re.S)
    body = re.sub(r"</svg>\s*$", "", body)
    body = re.sub(r"<metadata.*?</metadata>|<sodipodi:namedview[^>]*/>|<title>.*?</title>", "", body, flags=re.S)
    return f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{vb}">{body}</svg>'


def text(x, y, s, size, color=INK, weight=500, anchor="start", style=""):
    s = s.replace("&", "&amp;")
    return (f'<text x="{x}" y="{y}" font-family="{F}" font-size="{size}" font-weight="{weight}" '
            f'fill="{color}" text-anchor="{anchor}" {style}>{s}</text>')


def card(x, y, w, h, stroke=LINE, sw=1):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="#FFFFFF" stroke="{stroke}" stroke-width="{sw}"/>'


def hourglass(x, y, s=13):
    return (f'<path d="M{x} {y} h{s} l{-s/2+1.5} {s/2} l{s/2-1.5} {s/2} h{-s} l{s/2-1.5} {-s/2} Z" '
            f'fill="none" stroke="{SKS}" stroke-width="1.6" stroke-linejoin="round"/>')


def eyes(x, y):
    o = ""
    for dx in (0, 9):
        o += f'<ellipse cx="{x+dx}" cy="{y}" rx="4" ry="5" fill="#FFFFFF" stroke="#1D1C1D" stroke-width="1.2"/>'
        o += f'<circle cx="{x+dx+1.2}" cy="{y+1}" r="2" fill="#1D1C1D"/>'
    return o


def app_badge(x, y):
    return (f'<rect x="{x}" y="{y-11}" width="30" height="15" rx="3" fill="#EBEBEB"/>'
            + text(x + 15, y, "APP", 9, SKS, 700, "middle"))


W = 600
P = [""]
P.append(text(28, 46, "GeckIt, your AI teammate in Slack", 26, INK, 700))
P.append(text(28, 72, "Offset from round 7, unchanged. New: role line and context.", 15, SUB, 400))

y = 92
P.append(card(16, y, W - 32, 246))
P.append(text(36, y + 32, "The mark and the lockup", 17, INK, 700))
P.append(place(S("offset.svg"), 36, y + 50, 132, 132))
P.append(text(36, y + 210, "Offset", 14, SUB, 600))
P.append(place(S("offset.svg"), 132, y + 192, 36, 36))
P.append(text(124, y + 215, "36 px", 12, SUB, 600, "end"))
P.append(place(S("offset-teammate-lockup-light.svg"), 196, y + 52, 368, 112))
P.append(f'<rect x="196" y="{y+176}" width="368" height="56" rx="12" fill="#1A1D21"/>')
P.append(place(S("offset-teammate-lockup-dark.svg"), 212, y + 182, 145, 44))
P.append(text(372, y + 203, "Same lockup", 13, "#A9AFB7", 500))
P.append(text(372, y + 221, "on Slack dark", 13, "#A9AFB7", 500))

y = 356
P.append(card(16, y, W - 32, 484, "#111418", 2))
P.append(text(36, y + 32, "In use: a Slack thread", 17, INK, 700))
P.append(f'<rect x="{W-280}" y="{y+16}" width="140" height="24" rx="12" fill="#EEF0F2"/>')
P.append(text(W - 210, y + 33, "FICTIONAL EXAMPLE", 12, SUB, 700, "middle"))
P.append(f'<rect x="{W-132}" y="{y+16}" width="96" height="24" rx="12" fill="{LIME}"/>')
P.append(text(W - 84, y + 33, "MOCKUP", 12, G, 700, "middle"))
sx, sy, sw = 32, y + 52, W - 64
P.append(f'<rect x="{sx}" y="{sy}" width="{sw}" height="418" rx="10" fill="#FFFFFF" stroke="#DDDDDD"/>')
P.append(f'<path d="M{sx} {sy+40} H{sx+sw}" stroke="#E8E8E8"/>')
P.append(text(sx + 16, sy + 26, "Thread", 16, SK, 800))
P.append(text(sx + 80, sy + 26, "#leadership", 14, SKS, 500))


def person(yy):
    P.append(f'<rect x="{sx+16}" y="{yy}" width="40" height="40" rx="9" fill="#C9CCD1"/>')
    P.append(text(sx + 36, yy + 27, "F", 18, "#FFFFFF", 700, "middle"))
    P.append(text(sx + 68, yy + 15, "Founder", 17, SK, 800))


T = 17
my = sy + 56
person(my)
P.append(f'<rect x="{sx+66}" y="{my+24}" width="72" height="23" rx="4" fill="{MBG}"/>')
P.append(text(sx + 69, my + 41, "@GeckIt", T, LINK, 600))
P.append(text(sx + 143, my + 41, "three points for this week’s", T, SK, 400))
P.append(text(sx + 68, my + 65, "update, from what we said above.", T, SK, 400))
P.append(f'<rect x="{sx+68}" y="{my+76}" width="48" height="26" rx="13" fill="#EEF4FC" stroke="#1D9BD1"/>')
P.append(eyes(sx + 83, my + 89))
P.append(text(sx + 105, my + 94, "1", 13, LINK, 700))
dy = my + 120
P.append(text(sx + 16, dy + 5, "2 replies", 13, SKS, 600))
P.append(f'<path d="M{sx+80} {dy} H{sx+sw-16}" stroke="#E8E8E8"/>')
ry = dy + 20
P.append(place(S("offset.svg"), sx + 16, ry, 40, 40))
P.append(text(sx + 68, ry + 15, "GeckIt", 17, SK, 800))
P.append(app_badge(sx + 132, ry + 15))
P.append(f'<text x="{sx+68}" y="{ry+41}" font-family="{F}" font-size="{T}" fill="{SK}"><tspan font-weight="800">Done.</tspan> Ready to paste:</text>')
qy = ry + 54
P.append(f'<rect x="{sx+68}" y="{qy}" width="4" height="80" rx="2" fill="#DDDDDD"/>')
for i, ln in enumerate(["1. The invite flow is finished.", "2. A first onboarding draft is ready for review.", "3. Next: early access opens to our own team."]):
    P.append(text(sx + 84, qy + 20 + i * 26, ln, 16, SK, 400))
fy = qy + 102
person(fy)
P.append(text(sx + 68, fy + 41, "Perfect, posting it as is.", T, SK, 400))

y = 858
P.append(card(16, y, W - 32, 414))
P.append(text(36, y + 32, "Three ideas that tie the mark to the role", 17, INK, 700))

iy = y + 52
P.append(text(36, iy + 18, "1", 18, G, 800))
P.append(text(60, iy + 18, "Role line on first meeting", 16, INK, 700))
P.append(text(60, iy + 40, "Under the name in the lockup, app profile and welcome.", 14, SUB, 400))
P.append(f'<rect x="60" y="{iy + 52}" width="300" height="34" rx="8" fill="#F6F6F6"/>')
P.append(place(S("offset.svg"), 70, iy + 61, 16, 16))
P.append(text(94, iy + 74, "GeckIt", 14, SK, 700))
P.append(text(144, iy + 74, "AI teammate in Slack", 13, SKS, 400))

iy = y + 158
P.append(f'<rect x="28" y="{iy-8}" width="{W-56}" height="132" rx="12" fill="#F7FBE6" stroke="{LIME}"/>')
P.append(text(36, iy + 18, "2", 18, G, 800))
P.append(text(60, iy + 18, "Taken, then done", 16, INK, 700))
P.append(text(W - 44, iy + 18, "strongest", 12, "#4F6B00", 700, "end"))
P.append(text(60, iy + 40, "A status line while it works; the reply opens with", 14, SUB, 400))
P.append(text(60, iy + 58, "“Done.” and the finished text.", 14, SUB, 400))
P.append(f'<rect x="60" y="{iy+70}" width="236" height="44" rx="8" fill="#FFFFFF" stroke="#E3E3E3"/>')
P.append(hourglass(70, iy + 79))
P.append(text(90, iy + 91, "Working on it", 13, SK, 600))
P.append(text(70, iy + 107, "Reading the thread", 12, SKS, 400))
P.append(text(312, iy + 98, "→", 20, "#9AA39D", 500, "middle"))
P.append(f'<rect x="328" y="{iy+70}" width="236" height="44" rx="8" fill="#FFFFFF" stroke="#E3E3E3"/>')
P.append(f'<text x="338" y="{iy+91}" font-family="{F}" font-size="13" fill="{SK}"><tspan font-weight="800">Done.</tspan> Ready to paste:</text>')
P.append(text(338, iy + 107, "three points", 12, SKS, 400))

iy = y + 304
P.append(text(36, iy + 18, "3", 18, G, 800))
P.append(text(60, iy + 18, "The snap, in two frames", 16, INK, 700))
P.append(text(60, iy + 40, "Bars level, then lime jumps. Site or video only.", 14, SUB, 400))
P.append(place(S("offset-taken.svg"), 60, iy + 50, 44, 44))
P.append(text(120, iy + 78, "→", 20, "#9AA39D", 500, "middle"))
P.append(place(S("offset.svg"), 136, iy + 50, 44, 44))
P.append(text(192, iy + 70, "taken", 12, SUB, 600))
P.append(text(192, iy + 86, "done", 12, SUB, 600))
P.append(text(240, iy + 70, "frame 1, then frame 2", 12, SUB, 400))
P.append(text(240, iy + 86, "(the static mark)", 12, SUB, 400))

H = y + 414 + 16
P[0] = f'<rect width="{W}" height="{H}" fill="{BG}"/>'
doc = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(P)}</svg>'
path = os.path.join(WORK, "sheet.svg")
open(path, "w").write(doc)
subprocess.run(["rsvg-convert", "-z", "3", "-o", os.path.join(HERE, "geckit-offset-slack-teammate.png"), path], check=True)
print("ok", H)
