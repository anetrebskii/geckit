import base64
import math
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
V1 = os.path.join(HERE, "..", "svg")
TMP = os.path.join(HERE, "work")
os.makedirs(TMP, exist_ok=True)

GREEN = "#138A3E"
INK = "#0B1510"
PAPER = "#F4F7F5"
SLACK_LIGHT, SLACK_DARK = "#FFFFFF", "#1A1D21"
FONT = "Avenir Next"


def tail_path(x, y, deg, straight, curl, turn, w0, w1, tip, n=220):
    total = straight + curl
    th = math.radians(deg)
    ds = total / n
    pts = []
    for i in range(n + 1):
        s = i * ds
        u = max(0.0, s - straight) / curl
        w = w0 + (w1 - w0) * min(1.0, s / straight) if s <= straight else w1 + (tip - w1) * u ** 0.8
        pts.append((x, y, th, w / 2))
        k = 0.0 if s < straight else turn * 2 * u / curl
        th -= k * ds
        x += math.cos(th) * ds
        y += math.sin(th) * ds
    left = [(px - math.sin(t) * w, py + math.cos(t) * w) for px, py, t, w in pts]
    right = [(px + math.sin(t) * w, py - math.cos(t) * w) for px, py, t, w in pts]
    ew = pts[-1][3]
    sw = pts[0][3]
    f = lambda p: f"{p[0]:.1f} {p[1]:.1f}"
    d = "M" + f(right[0]) + f" A{sw:.1f} {sw:.1f} 0 0 0 " + f(left[0])
    d += " L" + " L".join(f(p) for p in left[1:])
    d += f" A{ew:.1f} {ew:.1f} 0 0 0 " + f(right[-1])
    d += " L" + " L".join(f(p) for p in reversed(right[:-1])) + " Z"
    return d


def mark(small=False):
    if small:
        short = '<path d="M44 140 L96 192" stroke-width="50"/>'
        tail = tail_path(96, 192, -50, 96, 92, 3.4, 50, 40, 34)
        return (f'<g fill="none" stroke="currentColor" stroke-linecap="round">{short}</g>'
                f'<path d="{tail}"/>')
    short = '<path d="M46 138 L94 186" stroke-width="46"/>'
    tail = tail_path(94, 186, -50, 88, 180, 7.6, 46, 31, 10)
    return (f'<g fill="none" stroke="currentColor" stroke-linecap="round">{short}</g>'
            f'<path d="{tail}"/>')


OFF = {False: "translate(24 4)", True: "translate(21 -5)"}


def tile(small=False, bg=GREEN, fg="#FFFFFF"):
    return (f'<rect width="256" height="256" rx="58" fill="{bg}"/>'
            f'<g color="{fg}" fill="{fg}" transform="{OFF[small]}">{mark(small)}</g>')


def svg(body, w, h, title=None):
    t = f"<title>{title}</title>" if title else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{t}{body}</svg>'


def save(name, content):
    p = os.path.join(HERE, name)
    open(p, "w").write(content)
    return p


def run(*a):
    return subprocess.run(a, check=True, capture_output=True, text=True).stdout


def text_width(s, size, weight):
    p = os.path.join(TMP, "measure.svg")
    open(p, "w").write(svg(f'<text id="t" x="0" y="100" font-family="{FONT}" font-weight="{weight}" font-size="{size}">{s}</text>', 2000, 200))
    return float(run("inkscape", p, "--query-id=t", "--query-width"))


def wordmark(x, y, size, color):
    weight = 700
    geck = text_width("Geck", size, weight)
    cap = size * 0.708
    stem = size * 0.135
    serif = size * 0.30
    bar = size * 0.105
    gap = size * 0.035
    ix = x + geck + gap + serif / 2
    i = (f'<rect x="{ix - stem/2:.1f}" y="{y - cap:.1f}" width="{stem:.1f}" height="{cap:.1f}"/>'
         f'<rect x="{ix - serif/2:.1f}" y="{y - cap:.1f}" width="{serif:.1f}" height="{bar:.1f}"/>'
         f'<rect x="{ix - serif/2:.1f}" y="{y - bar:.1f}" width="{serif:.1f}" height="{bar:.1f}"/>')
    tx = ix + serif / 2 + gap
    return (f'<g fill="{color}"><text x="{x}" y="{y}" font-family="{FONT}" font-weight="{weight}" font-size="{size}">Geck</text>'
            f'{i}<text x="{tx:.1f}" y="{y}" font-family="{FONT}" font-weight="{weight}" font-size="{size}">t</text></g>')


def outline(name, content):
    raw = os.path.join(TMP, name)
    open(raw, "w").write(content)
    out = os.path.join(HERE, name)
    run("inkscape", raw, "--export-text-to-path", "--export-plain-svg", f"--export-filename={out}")
    return out


save("tick-tail.svg", svg(tile(), 256, 256, "GeckIt Tick Tail"))
save("tick-tail-16.svg", svg(tile(True), 256, 256, "GeckIt Tick Tail, 16 px cut"))
save("tick-tail-16-mark.svg", svg(f'<g color="#000" fill="#000" transform="{OFF[True]}">{mark(True)}</g>', 256, 256))
save("tick-tail-mark.svg", svg(f'<g color="#000" fill="#000" transform="{OFF[False]}">{mark()}</g>', 256, 256, "GeckIt Tick Tail mark"))
for theme, ink in (("light", INK), ("dark", PAPER)):
    body = f'<svg x="0" y="4" width="112" height="112" viewBox="0 0 256 256">{tile()}</svg>' + wordmark(136, 88, 76, ink)
    outline(f"tick-tail-lockup-{theme}.svg", svg(body, 420, 120, "GeckIt"))
print("ok")
