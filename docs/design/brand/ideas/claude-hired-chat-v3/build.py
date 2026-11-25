import pathlib, re, subprocess
OUT = pathlib.Path(__file__).parent
WM = (OUT / "../../brand/geckit-logo/logo/geckit-wordmark-on-light.svg").resolve().read_text()
WM_PATHS = re.findall(r'<path (transform="[^"]+") d="([^"]+)"', WM)
THEMES = {"light": ("#FFFFFF", "#16191D", "#1F8031"), "dark": ("#16191D", "#FFFFFF", "#4AC85C")}

MARKS = {
    "v2-before": [
        ("ink", "M26 6H102Q116 6 116 20V62Q116 76 102 76H72L64 86L56 76H26Q12 76 12 62V20Q12 6 26 6Z", ""),
        ("act", "M26 122V110Q26 94 44 93H54L64 107L74 93H84Q102 94 102 110V122Z", ""),
    ],
    "a-tail-tie": [
        ("ink", "M30 6H98Q114 6 114 22V50Q114 66 98 66H72L69 76L76 104L64 116L52 104L59 76L56 66H30Q14 66 14 50V22Q14 6 30 6Z", ""),
        ("act", "M8 128V104Q8 84 30 82H40L56 128Z M120 128V104Q120 84 98 82H88L72 128Z", ""),
    ],
    "b-tail-tie-knot": [
        ("ink", "M30 6H98Q114 6 114 22V50Q114 66 98 66H72L69 75H59L56 66H30Q14 66 14 50V22Q14 6 30 6Z M59 79H69L76 104L64 116L52 104Z", ""),
        ("act", "M8 128V104Q8 84 30 82H40L56 128Z M120 128V104Q120 84 98 82H88L72 128Z", ""),
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
run("magick", *cols, "-background", "#F2F3F5", "-gravity", "north", "+append", str(OUT / "geckit-hired-chat-v3.png"))
