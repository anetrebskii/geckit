import pathlib, re, subprocess
OUT = pathlib.Path(__file__).parent
INK, WHITE, GL, GD = "#16191D", "#FFFFFF", "#1F8031", "#4AC85C"
WM = (OUT / "../../brand/geckit-logo/logo/geckit-wordmark-on-light.svg").resolve().read_text()
WP = re.findall(r'<path (transform="[^"]+") d="([^"]+)"', WM)
VARIANTS = {"0-first-all-ink": set(), "a-it-green": {4, 5}, "b-i-green": {4}, "c-g-green": {0}}

def words(green, ink, acc):
    return "".join(f'<path {t} d="{d}" fill="{acc if i in green else ink}"/>' for i, (t, d) in enumerate(WP))

def logo(green, ink, acc, bg):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 10 460 150"><title>GeckIt</title>'
            f'<rect x="20" y="10" width="460" height="150" fill="{bg}"/>{words(green, ink, acc)}</svg>')

def icon(green):
    sel = "".join(f'<path {t} d="{d}" fill="{GD}"/>' for i, (t, d) in enumerate(WP) if i in green)
    xs = {0: (40, 140), 4: (357, 450), 5: (357, 450)}
    x0 = min(xs[i][0] for i in green); x1 = max(xs[i][1] for i in green)
    w = x1 - x0; pad = (160 - w) / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>GeckIt</title>'
            f'<rect width="128" height="128" rx="29" fill="{INK}"/>'
            f'<svg x="14" y="14" width="100" height="100" viewBox="{x0 - pad} 4 160 160">{sel}</svg></svg>')

def run(*a): subprocess.run(a, check=True)
w = OUT / "work"; cols = []
for name, g in VARIANTS.items():
    d = OUT / name; d.mkdir(exist_ok=True)
    (d / "logo-light.svg").write_text(logo(g, INK, GL, WHITE))
    (d / "logo-dark.svg").write_text(logo(g, WHITE, GD, INK))
    (d / "logo-mono.svg").write_text(logo(g, INK, INK, WHITE))
    if g:
        (d / "app-icon.svg").write_text(icon(g))
    rows = []
    for v in ("logo-light", "logo-dark"):
        run("rsvg-convert", "-w", "460", str(d / f"{v}.svg"), "-o", str(w / f"{name}-{v}.png")); rows.append(str(w / f"{name}-{v}.png"))
        run("rsvg-convert", "-h", "16", str(d / f"{v}.svg"), "-o", str(w / f"{name}-{v}-16.png"))
        run("magick", str(w / f"{name}-{v}-16.png"), "-filter", "point", "-resize", "400%", str(w / f"{name}-{v}-16z.png")); rows.append(str(w / f"{name}-{v}-16z.png"))
    if g:
        run("rsvg-convert", "-w", "200", str(d / "app-icon.svg"), "-o", str(w / f"{name}-icon.png"))
        sm = []
        for px in (16, 32):
            run("rsvg-convert", "-w", str(px), "-b", "#F2F3F5", str(d / "app-icon.svg"), "-o", str(w / f"{name}-icon-{px}.png"))
            run("magick", str(w / f"{name}-icon-{px}.png"), "-filter", "point", "-resize", "120x120", str(w / f"{name}-icon-{px}z.png")); sm.append(str(w / f"{name}-icon-{px}z.png"))
        run("magick", str(w / f"{name}-icon.png"), *sm, "-background", "#F2F3F5", "-gravity", "center", "+append", str(w / f"{name}-icons.png")); rows.append(str(w / f"{name}-icons.png"))
    run("magick", *rows, "-background", "#F2F3F5", "-gravity", "north", "-splice", "0x12", "-append", "-bordercolor", "#F2F3F5", "-border", "12", str(w / f"{name}-col.png"))
    cols.append(str(w / f"{name}-col.png"))
run("magick", *cols, "-background", "#F2F3F5", "-gravity", "north", "+append", str(OUT / "geckit-wordmark.png"))
