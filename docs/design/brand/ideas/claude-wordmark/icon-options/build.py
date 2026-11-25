import pathlib, re, subprocess
OUT = pathlib.Path(__file__).parent
W = OUT / "work"; W.mkdir(exist_ok=True)
INK, WHITE, GD, BG = "#16191D", "#FFFFFF", "#4AC85C", "#ECEDEF"
WM = (OUT / "../../../brand/geckit-logo/logo/geckit-wordmark-on-light.svg").resolve().read_text()
WP = re.findall(r'<path (transform="[^"]+") d="([^"]+)"', WM)

def run(*a): return subprocess.run(a, check=True, capture_output=True, text=True).stdout

def paths(ids, fill, extra=""):
    return "".join(f'<path {WP[i][0]} d="{WP[i][1]}" fill="{fill}" {extra}/>' for i in ids)

def bbox(ids):
    f = W / "bbox.svg"
    f.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 200" width="5000" height="2000">{paths(ids, "#000")}</svg>')
    run("rsvg-convert", "-b", "white", str(f), "-o", str(W / "bbox.png"))
    w, h, x, y = map(int, re.match(r"(\d+)x(\d+)\+(\d+)\+(\d+)", run("magick", str(W / "bbox.png"), "-format", "%@", "info:")).groups())
    return x / 10, y / 10, w / 10, h / 10

def place(ids, fill, box, extra=""):
    bx, by, bw, bh = bbox(ids)
    x, y, w, h = box
    s = min(w / bw, h / bh)
    vw, vh = w / s, h / s
    vb = f"{bx - (vw - bw) / 2} {by - (vh - bh) / 2} {vw} {vh}"
    return f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{vb}" overflow="visible">{paths(ids, fill, extra)}</svg>'

def svg(body): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>GeckIt</title>{body}</svg>'
TILE = f'<rect width="128" height="128" rx="29" fill="{INK}"/>'

OPTIONS = {
    "1-i-cursor": svg(TILE + place([4], GD, (24, 30, 80, 68))),
    "2-it-no-tile": svg(place([4, 5], GD, (14, 22, 100, 84), f'stroke="{INK}" stroke-width="90" stroke-linejoin="round" paint-order="stroke"')),
    "3-g-with-it": svg(TILE + place([0], WHITE, (18, 18, 92, 92)) + place([4, 5], GD, (50, 36, 30, 24))),
}

def neighbour(letters, fg, bg):
    return svg(f'<rect width="128" height="128" rx="29" fill="{bg}"/><text x="64" y="80" font-family="Helvetica Neue" font-weight="600" font-size="50" text-anchor="middle" fill="{fg}">{letters}</text>')

NB = [("Ps", "#31A8FF", "#001E36"), ("Ai", "#FF9A00", "#330000"), ("Id", "#FF3366", "#49021F"), ("Lr", "#31A8FF", "#001E36")]
for i, n in enumerate(NB):
    (W / f"nb{i}.svg").write_text(neighbour(*n))
    run("rsvg-convert", "-w", "128", str(W / f"nb{i}.svg"), "-o", str(W / f"nb{i}.png"))

rows = []
for name, s in OPTIONS.items():
    (OUT / f"{name}.svg").write_text(s)
    sizes = []
    for px in (512, 64, 32, 16):
        p = W / f"{name}-{px}.png"
        run("rsvg-convert", "-w", str(px), str(OUT / f"{name}.svg"), "-o", str(p))
        cell = W / f"{name}-{px}-cell.png"
        run("magick", "-background", BG, str(p), "-gravity", "center", "-extent", f"{max(px + 32, 80)}x544", str(cell))
        sizes.append(str(cell))
    dock = W / f"{name}-dock.png"
    run("magick", "-background", "#C9CBD3", str(W / "nb0.png"), str(W / "nb1.png"), str(W / f"{name}-64.png"), str(W / "nb2.png"), str(W / "nb3.png"),
        "-resize", "96x96", "-gravity", "center", "-extent", "112x128", "+append", "-bordercolor", "#C9CBD3", "-border", "12", "-gravity", "center", "-background", BG, "-extent", "620x544", str(dock))
    dark = W / f"{name}-dockdark.png"
    run("magick", "-background", "#2B2D33", str(W / "nb0.png"), str(W / "nb1.png"), str(W / f"{name}-64.png"), str(W / "nb2.png"),
        "-resize", "96x96", "-gravity", "center", "-extent", "112x128", "+append", "-bordercolor", "#2B2D33", "-border", "12", str(W / f"{name}-dd.png"))
    run("magick", str(dock), str(W / f"{name}-dd.png"), "-gravity", "south", "-geometry", "+0+40", "-composite", str(dark))
    row = W / f"{name}-row.png"
    run("magick", "-background", BG, *sizes, str(dark), "+append", str(row))
    rows.append(str(row))
run("magick", "-background", BG, *rows, "-gravity", "north", "-splice", "0x16", "-append", str(OUT / "icon-options.png"))
