import pathlib, re, subprocess
OUT = pathlib.Path(__file__).parent
INK, WHITE, GREEN, TILE_DARK = "#16191D", "#FFFFFF", "#4AC85C", "#16191D"
WM = (OUT / "../../brand/geckit-logo/logo/geckit-wordmark-on-light.svg").resolve().read_text()
WP = re.findall(r'<path (transform="[^"]+") d="([^"]+)"', WM)
W = 15

def figure(c):
    return (f'<g fill="{c}" stroke="{c}" stroke-linecap="round" stroke-linejoin="round">'
            f'<rect x="12" y="8" width="104" height="62" rx="20" stroke="none"/>'
            f'<path d="M42 64H68L48 89L37 86Z" stroke-width="2"/>'
            f'<path d="M42 84L31 112H50" fill="none" stroke-width="{W}"/>'
            f'<path d="M84 66L97 112H114" fill="none" stroke-width="{W}"/></g>')

def mark_svg(c, bg=None):
    b = f'<rect width="128" height="128" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>GeckIt</title>{b}{figure(c)}</svg>'

def icon_svg():
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>GeckIt</title>'
            f'<rect width="128" height="128" rx="29" fill="{TILE_DARK}"/>'
            f'<svg x="22" y="20" width="84" height="84" viewBox="0 0 128 128">{figure(GREEN)}</svg></svg>')

def lockup_svg(c, bg):
    words = "".join(f'<path {t} d="{d}" fill="{c}"/>' for t, d in WP)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 590 140"><title>GeckIt</title>'
            f'<rect width="590" height="140" fill="{bg}"/>'
            f'<svg x="8" y="6" width="128" height="128" viewBox="0 0 128 128">{figure(c)}</svg>'
            f'<svg x="160" y="7" width="424" height="126" viewBox="36 19 424 126">{words}</svg></svg>')

files = {
    "mark-ink.svg": mark_svg(INK), "mark-white.svg": mark_svg(WHITE),
    "app-icon.svg": icon_svg(),
    "logo-light.svg": lockup_svg(INK, WHITE), "logo-dark.svg": lockup_svg(WHITE, INK),
}
for n, s in files.items():
    (OUT / n).write_text(s)

w = OUT / "work"
def run(*a): subprocess.run(a, check=True)
run("rsvg-convert", "-w", "512", "-b", WHITE, str(OUT / "mark-ink.svg"), "-o", str(w / "m512.png"))
run("rsvg-convert", "-w", "512", str(OUT / "app-icon.svg"), "-o", str(w / "i512.png"))
small = []
for name, bg in (("mark-ink.svg", WHITE), ("mark-white.svg", INK), ("app-icon.svg", "#F2F3F5")):
    for px in (16, 32):
        p = w / f"{name}-{px}.png"
        run("rsvg-convert", "-w", str(px), "-h", str(px), "-b", bg, str(OUT / name), "-o", str(p))
        z = w / f"{name}-{px}-z.png"
        run("magick", str(p), "-filter", "point", "-resize", "160x160", "-bordercolor", "#D0D3D8", "-border", "2", str(z))
        small.append(str(z))
run("magick", *small, "+append", str(w / "small.png"))
for n in ("logo-light", "logo-dark"):
    run("rsvg-convert", "-w", "1024", str(OUT / f"{n}.svg"), "-o", str(w / f"{n}.png"))
    run("rsvg-convert", "-h", "16", str(OUT / f"{n}.svg"), "-o", str(w / f"{n}-16.png"))
    run("magick", str(w / f"{n}-16.png"), "-filter", "point", "-resize", "500%", str(w / f"{n}-16z.png"))
run("magick", str(w / "m512.png"), str(w / "i512.png"), "+append", "-resize", "1024x", str(w / "top.png"))
run("magick", str(w / "top.png"), str(w / "logo-light.png"), str(w / "logo-dark.png"), str(w / "logo-light-16z.png"), str(w / "small.png"),
    "-background", "#F2F3F5", "-gravity", "center", "-extent", "1024x", "-gravity", "north", "-splice", "0x16", "-append", str(OUT / "walking-chat-sheet.png"))
