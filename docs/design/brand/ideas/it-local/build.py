import math, pathlib, re, subprocess
OUT = pathlib.Path(__file__).parent
BRAND = OUT.parent.parent
INK, GD = "#16191D", "#4AC85C"
WM = (BRAND / "ideas/geckit-logo-g/logo/geckit-wordmark-on-light.svg").read_text()
WP = re.findall(r'<path (transform="[^"]+") d="([^"]+)"', WM)
IT = "".join(f'<path {WP[i][0]} d="{WP[i][1]}" fill="{GD}"/>' for i in (4, 5))
IT_BOX = "361 40 93 95"

def it(x, y, h):
    w = h * 93 / 95
    return f'<svg x="{x - w / 2:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" viewBox="{IT_BOX}">{IT}</svg>'

def squircle(x, y, s, n=5, steps=360):
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, si = math.cos(t), math.sin(t)
        pts.append((x + s / 2 + abs(c) ** (2 / n) * math.copysign(1, c) * s / 2, y + s / 2 + abs(si) ** (2 / n) * math.copysign(1, si) * s / 2))
    return "M" + " L".join(f"{a:.2f} {b:.2f}" for a, b in pts) + " Z"

tile = squircle(100, 100, 824)
dev = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><title>GeckIt local build icon</title>'
       f'<defs><clipPath id="t"><path d="{tile}"/></clipPath><filter id="sh" x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur in="SourceAlpha" stdDeviation="10"/><feOffset dy="8"/>'
       f'<feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
       f'<path d="{tile}" fill="{INK}" filter="url(#sh)"/>' + it(512, 222, 420)
       + f'<rect x="100" y="748" width="824" height="116" fill="#E8701A" clip-path="url(#t)"/>'
       + '<text x="512" y="836" font-family="Helvetica Neue, Helvetica, Arial" font-size="88" font-weight="700" fill="#FFFFFF" text-anchor="middle">LOCAL</text></svg>')
(OUT / "icon-dev.svg").write_text(dev)
subprocess.run(["rsvg-convert", "-w", "1024", str(OUT / "icon-dev.svg"), "-o", str(OUT / "icon-dev.png")], check=True)
tile_sm = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="29" fill="{INK}"/>{it(64, 22, 84)}</svg>'
(OUT / "it-tile.svg").write_text(tile_sm)
