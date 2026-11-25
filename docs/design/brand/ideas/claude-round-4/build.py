import pathlib, re, subprocess
OUT = pathlib.Path(__file__).parent
WM = (OUT / "../../brand/geckit-logo/logo/geckit-wordmark-on-light.svg").resolve().read_text()
WM_PATHS = re.findall(r'<path (transform="[^"]+") d="([^"]+)"', WM)
THEMES = {"light": ("#FFFFFF", "#16191D", "#1F8031"), "dark": ("#16191D", "#FFFFFF", "#4AC85C")}

MARKS = {
    "a-invisible-employee": [
        ("ink", "M28 40a16 16 0 1 0 32 0a16 16 0 1 0 -32 0Z M34 40a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z M68 40a16 16 0 1 0 32 0a16 16 0 1 0 -32 0Z M74 40a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z M58 36H70V43H58Z M34 76L62 82L46 102Z M94 76L66 82L82 102Z", ""),
        ("act", "M58 84H70L68 94H60Z M60 97H68L75 117L64 126L53 117Z", ""),
    ],
    "b-paper-doll-chain": [
        ("ink", "M15 26a9 9 0 1 0 18 0a9 9 0 1 0 -18 0Z M13 40H35V118H26V84H22V118H13Z M55 26a9 9 0 1 0 18 0a9 9 0 1 0 -18 0Z M53 40H75V118H66V84H62V118H53Z M35 46H53V54H35Z", ""),
        ("act", "M95 26a9 9 0 1 0 18 0a9 9 0 1 0 -18 0Z M93 40H115V118H106V84H102V118H93Z M75 46H93V54H75Z", ""),
    ],
    "c-walking-chat": [
        ("ink", "M30 6H98Q114 6 114 22V52Q114 68 98 68H58L46 106H58Q63 106 63 111V117Q63 122 58 122H32Q26 122 28 116L40 68H30Q14 68 14 52V22Q14 6 30 6Z", ""),
        ("act", "M70 74H83L94 104H108Q112 104 112 108V114Q112 118 108 118H86Q82 118 81 114Z", ""),
    ],
    "d-winged-chat": [
        ("ink", "M44 30H84Q96 30 96 42V66Q96 78 84 78H62L50 92V78H44Q32 78 32 66V42Q32 30 44 30Z", ""),
        ("act", "M28 44Q14 30 2 34Q8 40 6 46Q14 48 12 56Q20 58 24 64L28 62Z M100 44Q114 30 126 34Q120 40 122 46Q114 48 116 56Q108 58 104 64L100 62Z", ""),
    ],
    "e-caped-chat": [
        ("ink", "M54 22H106Q118 22 118 34V58Q118 70 106 70H74L60 84V70H54Q42 70 42 58V34Q42 22 54 22Z", 'transform="rotate(-14 80 50)"'),
        ("act", "M46 36Q22 44 6 66Q18 64 22 72Q12 80 8 96Q22 90 30 96Q34 80 46 74Z", ""),
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
run("magick", *cols, "-background", "#F2F3F5", "-gravity", "north", "+append", str(OUT / "geckit-round-4.png"))
