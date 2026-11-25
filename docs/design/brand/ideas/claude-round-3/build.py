import pathlib, re, subprocess
OUT = pathlib.Path(__file__).parent
WM = (OUT / "../../brand/geckit-logo/logo/geckit-wordmark-on-light.svg").resolve().read_text()
WM_PATHS = re.findall(r'<path (transform="[^"]+") d="([^"]+)"', WM)
THEMES = {"light": ("#FFFFFF", "#16191D", "#1F8031"), "dark": ("#16191D", "#FFFFFF", "#4AC85C")}

MARKS = {
    "0-first-typing": [
        ("ink", "M24 14H104Q116 14 116 26V74Q116 86 104 86H54L32 108V86H24Q12 86 12 74V26Q12 14 24 14Z M34 42H50V58H34Z M56 42H72V58H56Z", ""),
        ("act", "M78 42H94V58H78Z", ""),
    ],
    "a-walking-chat": [
        ("ink", "M30 6H98Q114 6 114 22V52Q114 68 98 68H58L46 106H58Q63 106 63 111V117Q63 122 58 122H32Q26 122 28 116L40 68H30Q14 68 14 52V22Q14 6 30 6Z", ""),
        ("act", "M70 74H83L94 104H108Q112 104 112 108V114Q112 118 108 118H86Q82 118 81 114Z", ""),
    ],
    "b-time-card": [
        ("ink", "M36 4H92Q98 4 98 10V118Q98 124 92 124H36Q30 124 30 118V10Q30 4 36 4Z M42 16H86V22H42Z M42 98H86V104H42Z M42 110H70V116H42Z", ""),
        ("act", "M48 36H80Q86 36 86 42V66Q86 72 80 72H60L50 84V72H48Q42 72 42 66V42Q42 36 48 36Z", ""),
    ],
    "c-night-shift-moon": [
        ("ink", "M59.50 16.00A46 46 0 1 0 105.38 69.53A36 36 0 0 1 59.50 16.00Z", ""),
        ("ink", "M30 92L18 122L52 104Z", ""),
        ("act", "M84 70a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z", ""),
    ],
    "d-tail-check": [
        ("ink", "M28 8H100Q116 8 116 24V58Q116 74 100 74H58L44 100L28 84L38 74H28Q12 74 12 58V24Q12 8 28 8Z", ""),
        ("act", "M44 112L20 88L30 78L44 92L74 52L86 60Z", ""),
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
run("magick", *cols, "-background", "#F2F3F5", "-gravity", "north", "+append", str(OUT / "geckit-round-3.png"))
