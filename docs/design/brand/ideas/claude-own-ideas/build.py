import pathlib, re, subprocess
OUT = pathlib.Path(__file__).parent
WM = (OUT / "../../brand/geckit-logo/logo/geckit-wordmark-on-light.svg").resolve().read_text()
WM_PATHS = re.findall(r'<path (transform="[^"]+") d="([^"]+)"', WM)
THEMES = {"light": ("#FFFFFF", "#16191D", "#1F8031"), "dark": ("#16191D", "#FFFFFF", "#4AC85C")}

MARKS = {
    "0-first-check-bubble": [
        ("ink", "M24 14H104Q116 14 116 26V74Q116 86 104 86H54L32 108V86H24Q12 86 12 74V26Q12 14 24 14Z", ""),
        ("act", "M38 50L50 40L60 52L84 28L96 40L60 74Z", ""),
    ],
    "1-night-shift": [
        ("ink", "M34 6H94Q102 6 102 14V122H26V14Q26 6 34 6Z M70 40H86V58H70Z", ""),
        ("act", "M72 42H84V56H72Z", ""),
    ],
    "2-order-ticket": [
        ("ink", "M10 10H118V16H10Z M40 26H96V114L86.7 106L77.3 114L68 106L58.7 114L49.3 106L40 114Z M50 44H86V52H50Z M50 74H74V82H50Z", 'transform="rotate(8 64 16)"'),
        ("act", "M62 13H74V34H62Z M50 59H86V67H50Z", 'transform="rotate(8 64 16)"'),
    ],
    "3-hired-chat": [
        ("ink", "M30 6H98Q110 6 110 18V52Q110 64 98 64H72L64 74L56 64H30Q18 64 18 52V18Q18 6 30 6Z", ""),
        ("act", "M14 122V104Q14 84 36 82H52L64 100L76 82H92Q114 84 114 104V122Z", ""),
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
run("magick", *cols, "-background", "#F2F3F5", "-gravity", "north", "+append", str(OUT / "geckit-own-ideas.png"))
