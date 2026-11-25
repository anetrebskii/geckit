import pathlib, re, subprocess
OUT = pathlib.Path(__file__).parent
INK, WHITE, GREEN, TILE_DARK = "#16191D", "#FFFFFF", "#4AC85C", "#16191D"
WM = (OUT / "../../brand/geckit-logo/logo/geckit-wordmark-on-light.svg").resolve().read_text()
WP = re.findall(r'<path (transform="[^"]+") d="([^"]+)"', WM)
W = 15



def figure(c, act=None):
    act = act or c
    head = "M30 6H98Q116 6 116 24V48Q116 66 98 66H72L69 75L75 101L64 114L53 101L59 75L56 66H30Q12 66 12 48V24Q12 6 30 6Z"
    jacket = "M6 128V106Q6 84 28 82H40L57 128Z M122 128V106Q122 84 100 82H88L71 128Z"
    return f'<path d="{head}" fill="{c}"/><path d="{jacket}" fill="{act}"/>'

def mark_svg(c, bg=None):
    b = f'<rect width="128" height="128" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>GeckIt</title>{b}{figure(c)}</svg>'

def icon_svg():
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>GeckIt</title>'
            f'<defs><clipPath id="t"><rect width="128" height="128" rx="29"/></clipPath></defs>'
            f'<rect width="128" height="128" rx="29" fill="{TILE_DARK}"/>'
            f'<g clip-path="url(#t)"><svg x="18" y="36" width="92" height="92" viewBox="0 0 128 128">{figure(WHITE, GREEN)}</svg></g></svg>')

def lockup_svg(c, bg, act):
    words = "".join(f'<path {t} d="{d}" fill="{c}"/>' for t, d in WP)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 590 140"><title>GeckIt</title>'
            f'<rect width="590" height="140" fill="{bg}"/>'
            f'<svg x="14" y="6" width="116" height="116" viewBox="0 0 128 128">{figure(c, act)}</svg>'
            f'<svg x="160" y="7" width="424" height="126" viewBox="36 19 424 126">{words}</svg></svg>')

files = {
    "mark-ink.svg": mark_svg(INK), "mark-white.svg": mark_svg(WHITE),
    "app-icon.svg": icon_svg(),
    "logo-light.svg": lockup_svg(INK, WHITE, "#1F8031"), "logo-dark.svg": lockup_svg(WHITE, INK, GREEN),
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
    "-background", "#F2F3F5", "-gravity", "center", "-extent", "1024x", "-gravity", "north", "-splice", "0x16", "-append", str(OUT / "hired-chat-sheet.png"))
