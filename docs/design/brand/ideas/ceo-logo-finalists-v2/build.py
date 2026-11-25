import pathlib, re, subprocess
OUT = pathlib.Path(__file__).parent
WM = (OUT / "../../brand/geckit-logo/logo/geckit-wordmark-on-light.svg").resolve().read_text()
WM_PATHS = re.findall(r'<path (transform="[^"]+") d="([^"]+)"', WM)
THEMES = {"light": ("#FFFFFF", "#16191D", "#1F8031"), "dark": ("#16191D", "#FFFFFF", "#4AC85C")}

MARKS = {
    "joint": [
        ("ink", "M22 28H68V50L47 45V89L68 84V106H22Q14 106 14 98V36Q14 28 22 28Z", ""),
        ("act", "M80 18H106Q114 18 114 26V81Q114 89 106 89H80V74L58 79V56L80 61Z", ""),
    ],
    "joint-wide": [
        ("ink", "M16 28H62V50L41 45V89L62 84V106H16Q8 106 8 98V36Q8 28 16 28Z", ""),
        ("act", "M74 18H112Q120 18 120 26V81Q120 89 112 89H74V74L52 79V56L74 61Z", ""),
    ],
    "handoff": [
        ("act", "M24 22H76L96 40V60Q96 66 90 66H24Q18 66 18 60V28Q18 22 24 22Z", 'transform="rotate(-12 57 44)"'),
        ("ink", "M113 72V100L100 114H58Q50 114 44 109L23 93Q18 89 21 84Q24 79 30 82L55 95H66L51 84Q48 80 51 75Q55 71 61 74L79 85L99 70Q108 62 113 72Z", ""),
    ],
    "imprint": [
        ("ink", "M64 10A15 15 0 1 1 63.99 10ZM56 38H72V54H56Z M30 56H98Q106 56 108 64L110 76H18L20 64Q22 56 30 56Z", ""),
        ("act", "M26 90H110L102 106H18Z", ""),
    ],
}

def mark(name, ink, act):
    return "".join(f'<path {t} d="{d}" fill="{ink if r == "ink" else act}" fill-rule="evenodd"/>' for r, d, t in MARKS[name])

def mark_svg(name, scheme, theme):
    bg, ink, act = THEMES[theme]
    a = act if scheme == "two-tone" else ink
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>GeckIt</title>{mark(name, ink, a)}</svg>'

def lockup_svg(name, scheme, theme, bgfill=False):
    bg, ink, act = THEMES[theme]
    a = act if scheme == "two-tone" else ink
    words = "".join(f'<path {t} d="{d}" fill="{ink}"/>' for t, d in WM_PATHS)
    back = f'<rect width="572" height="126" fill="{bg}"/>' if bgfill else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 572 126"><title>GeckIt</title>{back}'
            f'<svg x="0" y="2" width="122" height="122" viewBox="0 0 128 128">{mark(name, ink, a)}</svg>'
            f'<svg x="148" y="0" width="424" height="126" viewBox="36 19 424 126">{words}</svg></svg>')

for name in MARKS:
    (OUT / name).mkdir(exist_ok=True)
    for scheme in ("mono", "two-tone"):
        for theme in THEMES:
            (OUT / name / f"mark-{scheme}-{theme}.svg").write_text(mark_svg(name, scheme, theme))
            (OUT / name / f"logo-{scheme}-{theme}.svg").write_text(lockup_svg(name, scheme, theme))
            (OUT / "work" / f"{name}-logo-{scheme}-{theme}-bg.svg").write_text(lockup_svg(name, scheme, theme, True))

W = OUT / "work"
def run(*a): subprocess.run(a, check=True)
cols = []
for name in MARKS:
    tiles = []
    for theme in THEMES:
        bg = THEMES[theme][0]
        for scheme in ("two-tone", "mono"):
            src = OUT / name / f"mark-{scheme}-{theme}.svg"
            for px in (16, 32):
                p = W / f"{name}-{scheme}-{theme}-{px}.png"
                run("rsvg-convert", "-w", str(px), "-h", str(px), "-b", bg, str(src), "-o", str(p))
                z = W / f"{name}-{scheme}-{theme}-{px}-z.png"
                run("magick", str(p), "-filter", "point", "-resize", "96x96", "-bordercolor", "#E4E6EA", "-border", "3", str(z))
                tiles.append(str(z))
    big = W / f"{name}-512.png"
    run("rsvg-convert", "-w", "408", "-h", "408", "-b", "#FFFFFF", str(OUT / name / "mark-two-tone-light.svg"), "-o", str(big))
    rows = [str(big)]
    for theme in THEMES:
        p = W / f"{name}-lockup-{theme}.png"
        run("rsvg-convert", "-w", "408", str(W / f"{name}-logo-two-tone-{theme}-bg.svg"), "-o", str(p))
        rows.append(str(p))
        p16 = W / f"{name}-lockup-{theme}-16.png"
        run("rsvg-convert", "-h", "16", str(W / f"{name}-logo-two-tone-{theme}-bg.svg"), "-o", str(p16))
        z = W / f"{name}-lockup-{theme}-16-z.png"
        run("magick", str(p16), "-filter", "point", "-resize", "400%", str(z))
        rows.append(str(z))
    strip1 = W / f"{name}-small-a.png"; strip2 = W / f"{name}-small-b.png"
    run("magick", *tiles[:4], "+append", str(strip1)); run("magick", *tiles[4:], "+append", str(strip2))
    col = W / f"{name}-col.png"
    run("magick", *rows, str(strip1), str(strip2), "-background", "#F2F3F5", "-gravity", "north", "-splice", "0x12", "-append", "-bordercolor", "#F2F3F5", "-border", "12", str(col))
    cols.append(str(col))
run("magick", *cols, "-background", "#F2F3F5", "-gravity", "north", "+append", str(OUT / "geckit-finalists-v2.png"))
