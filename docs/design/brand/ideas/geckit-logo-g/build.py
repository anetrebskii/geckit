import math, os, shutil, subprocess, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
R14 = os.path.join(HERE, "..", "logo-concepts", "round-14-xcharter")
sys.path.insert(0, os.path.join(HERE, "..", "logo-concepts", "round-10-wordmark"))
import importlib.util
_spec = importlib.util.spec_from_file_location("r14build", os.path.join(R14, "build.py"))
b = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(b)
from PIL import Image
from fontTools.ttLib import TTFont

INK, WT, GR, GRL = b.INK, b.WT, b.GR_DARK, b.GR_LIGHT
TILE_ON_DARK = "#2A2E34"
OUT = os.path.join(HERE, "geckit-logo")
SCRATCH = os.environ["SCRATCH"]


def p(*a):
    path = os.path.join(OUT, *a)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def write(path, text):
    open(path, "w").write(text)
    return path


def png(svgp, out, w, bg=None):
    cmd = ["rsvg-convert", "-w", str(w), "-o", out, svgp]
    if bg:
        cmd[1:1] = ["-b", bg]
    subprocess.run(cmd, check=True)
    return out


def squircle(x, y, s, n=5, steps=360):
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, si = math.cos(t), math.sin(t)
        px = abs(c) ** (2 / n) * (1 if c >= 0 else -1)
        py = abs(si) ** (2 / n) * (1 if si >= 0 else -1)
        pts.append((x + s / 2 + px * s / 2, y + s / 2 + py * s / 2))
    return "M" + " L".join(f"{a:.2f} {c:.2f}" for a, c in pts) + " Z"


def g(fill, box, x=0, y=0, scale=0.58, bold=0):
    inner = b.g_path(fill, size=256, scale=scale, bold=bold)
    k = box / 256
    return f'<g transform="translate({x} {y}) scale({k:.5f})">{inner}</g>'


def svg(body, w, h, title):
    return b.svg(body, w, h, title)


# logo
for name, bg, fg in (("light", WT, INK), ("dark", INK, WT)):
    for kind in ("wordmark", "lockup"):
        src = os.path.join(R14, "svg", f"{kind}-{name}.svg" if kind == "wordmark" else f"lockup-green-on-ink-{name}.svg")
        s = open(src).read()
        s = s.replace(f'<rect width="100%" height="100%" fill="{bg}"/>', "")
        if name == "dark":
            s = s.replace(f'<rect width="256" height="256" rx="58" fill="{INK}"/>', f'<rect width="256" height="256" rx="58" fill="{TILE_ON_DARK}"/>')
        dst = write(p("logo", f"geckit-{kind}-{'on-light' if name == 'light' else 'on-dark'}.svg"), s)
        png(dst, dst.replace(".svg", "@2x.png"), 1200)
write(p("logo", "geckit-mark.svg"), svg(f'<rect width="256" height="256" rx="58" fill="{INK}"/>' + b.g_path(GR), 256, 256, "GeckIt mark"))
write(p("logo", "geckit-g-green.svg"), svg(b.g_path(GR), 256, 256, "GeckIt G, green"))
write(p("logo", "geckit-g-black.svg"), svg(b.g_path("#000000"), 256, 256, "GeckIt G, one colour"))
write(p("logo", "geckit-g-white.svg"), svg(b.g_path(WT), 256, 256, "GeckIt G, white"))

# macOS legacy tile (1024, tile 824, pad 100, squircle n=5, shadow)
tile = squircle(100, 100, 824)
mac = (f'<defs><filter id="sh" x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur in="SourceAlpha" stdDeviation="10"/><feOffset dy="8"/>'
       f'<feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
       f'<path d="{tile}" fill="{INK}" filter="url(#sh)"/>' + g(GR, 824, 100, 100))
macsmall = f'<path d="{tile}" fill="{INK}"/>' + g(GR, 824, 100, 100, bold=14)
ms = write(p("app-icon", "macos", "icon-1024.svg"), svg(mac, 1024, 1024, "GeckIt macOS icon"))
mss = write(p("app-icon", "macos", "icon-small.svg"), svg(macsmall, 1024, 1024, "GeckIt macOS icon, 16-32 px"))
iconset = os.path.join(SCRATCH, "GeckIt.iconset")
shutil.rmtree(iconset, ignore_errors=True)
os.makedirs(iconset)
for size in (16, 32, 128, 256, 512):
    for scale in (1, 2):
        px = size * scale
        name = f"icon_{size}x{size}{'@2x' if scale == 2 else ''}.png"
        png(mss if px <= 32 else ms, os.path.join(iconset, name), px)
subprocess.run(["iconutil", "-c", "icns", iconset, "-o", p("app-icon", "macos", "icon.icns")], check=True)
png(ms, p("app-icon", "macos", "icon.png"), 1024)

# macOS 26 Icon Composer bundle
ic = p("app-icon", "macos", "icon.icon", "Assets", "g.svg")
write(ic, svg(g(GR, 1024), 1024, 1024, "GeckIt G layer"))
srgb = lambda h: ",".join(f"{int(h[i:i+2], 16)/255:.5f}" for i in (1, 3, 5)) + ",1.00000"
write(p("app-icon", "macos", "icon.icon", "icon.json"), json.dumps({
    "fill": {"solid": f"extended-srgb:{srgb(INK)}"},
    "groups": [{"layers": [{"glass": True, "image-name": "g.svg", "name": "G"}],
                "shadow": {"kind": "neutral", "opacity": 0.5},
                "translucency": {"enabled": True, "value": 0.2}}],
    "supported-platforms": {"squares": "shared"}}, indent=2))

# Windows / Linux: near full-bleed rounded square, no shadow
win = f'<rect x="16" y="16" width="992" height="992" rx="222" fill="{INK}"/>' + g(GR, 992, 16, 16)
wins = f'<rect x="0" y="0" width="1024" height="1024" rx="200" fill="{INK}"/>' + g(GR, 1024, 0, 0, bold=16)
wv = write(p("app-icon", "windows-linux", "icon.svg"), svg(win, 1024, 1024, "GeckIt icon, Windows and Linux"))
wvs = write(p("app-icon", "windows-linux", "icon-small.svg"), svg(wins, 1024, 1024, "GeckIt icon, Windows and Linux, small"))
ims = []
for s in (16, 24, 32, 48, 64, 96, 128, 256, 512, 1024):
    out = png(wvs if s <= 48 else wv, p("app-icon", "windows-linux", "icons", f"{s}x{s}.png"), s)
    if s <= 256:
        ims.append(Image.open(out).convert("RGBA"))
ims[-1].save(p("app-icon", "windows-linux", "icon.ico"), sizes=[(i.width, i.height) for i in ims], append_images=ims[:-1])

# iOS: full-bleed square
ios = write(p("app-icon", "ios", "AppIcon.svg"), svg(f'<rect width="1024" height="1024" fill="{INK}"/>' + g(GR, 1024, 0, 0, scale=0.52), 1024, 1024, "GeckIt iOS icon"))
png(ios, p("app-icon", "ios", "AppIcon-512@2x.png"), 1024)

# Android adaptive: 108dp canvas, mark inside 66dp safe zone; legacy 48dp
fg = write(p("app-icon", "android", "ic_launcher_foreground.svg"), svg(g(GR, 108, 0, 0, scale=0.38), 108, 108, "GeckIt Android foreground"))
leg = write(p("app-icon", "android", "ic_launcher.svg"), svg(f'<rect x="2" y="2" width="44" height="44" rx="9" fill="{INK}"/>' + g(GR, 44, 2, 2), 48, 48, "GeckIt Android legacy"))
rnd = write(p("app-icon", "android", "ic_launcher_round.svg"), svg(f'<circle cx="24" cy="24" r="22" fill="{INK}"/>' + g(GR, 44, 2, 2, scale=0.54), 48, 48, "GeckIt Android round"))
for d, k in (("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)):
    png(fg, p("app-icon", "android", f"mipmap-{d}", "ic_launcher_foreground.png"), int(108 * k))
    png(leg, p("app-icon", "android", f"mipmap-{d}", "ic_launcher.png"), int(48 * k))
    png(rnd, p("app-icon", "android", f"mipmap-{d}", "ic_launcher_round.png"), int(48 * k))
write(p("app-icon", "android", "ic_launcher_background.xml"), f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{INK}</color>\n</resources>\n')

# macOS menu bar template: G alone, black with alpha, 18/36 like the current tray
tray = write(p("app-icon", "tray", "trayTemplate.svg"), svg(g("#000000", 18, 0, 0, scale=0.7, bold=18), 18, 18, "GeckIt tray"))
png(tray, p("app-icon", "tray", "trayTemplate.png"), 18)
png(tray, p("app-icon", "tray", "trayTemplate@2x.png"), 36)

# Web
fav = write(p("web", "favicon.svg"), svg(f'<rect width="256" height="256" rx="58" fill="{INK}"/>' + b.g_path(GR, scale=0.62, bold=10), 256, 256, "GeckIt"))
fims = [Image.open(png(fav, os.path.join(SCRATCH, f"fav{s}.png"), s)).convert("RGBA") for s in (16, 32, 48)]
fims[-1].save(p("web", "favicon.ico"), sizes=[(i.width, i.height) for i in fims], append_images=fims[:-1])
png(fav, p("web", "favicon-32.png"), 32)
png(fav, p("web", "favicon-16.png"), 16)
png(ios, p("web", "apple-touch-icon.png"), 180)
for s in (192, 512):
    png(ios, p("web", f"icon-{s}.png"), s)
write(p("web", "site.webmanifest"), json.dumps({"name": "GeckIt", "short_name": "GeckIt", "icons": [
    {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
    {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"}],
    "theme_color": INK, "background_color": INK, "display": "standalone"}, indent=2))
lock = os.path.join(R14, "svg", "lockup-green-on-ink-dark.svg")
ls = open(lock).read().replace(f'<rect width="256" height="256" rx="58" fill="{INK}"/>', f'<rect width="256" height="256" rx="58" fill="{TILE_ON_DARK}"/>')
import re
vb = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', ls)
lw, lh = float(vb.group(1)), float(vb.group(2))
body = re.sub(r"^.*?<svg[^>]*>", "", ls, flags=re.S).rsplit("</svg>", 1)[0]
body = re.sub(r"<title>.*?</title>", "", body)
k = 760 / lw
og = write(p("web", "og-image.svg"), svg(f'<rect width="1200" height="630" fill="{INK}"/><g transform="translate({(1200 - lw * k) / 2:.1f} {(630 - lh * k) / 2:.1f}) scale({k:.4f})">{body}</g>', 1200, 630, "GeckIt"))
png(og, p("web", "og-image.png"), 1200)

# Instagram
av = write(p("instagram", "geckit-avatar.svg"), svg(f'<rect width="256" height="256" fill="{INK}"/>' + b.g_path(GR, scale=0.5), 256, 256, "GeckIt avatar"))
png(av, p("instagram", "geckit-avatar-1080.png"), 1080)

# Fonts
for name in ("XCharter-Bold", "XCharter-Roman"):
    src = os.path.join(SCRATCH, "xcharter", f"{name}.otf")
    shutil.copy(src, p("fonts", f"{name}.otf"))
    f = TTFont(src)
    f.flavor = "woff2"
    f.save(p("fonts", f"{name}.woff2"))
shutil.copy(os.path.join(HERE, "..", "logo-concepts", "round-10-wordmark", "fonts", "LICENSE-XCharter.txt"), p("fonts", "LICENSE-XCharter.txt"))
print("done")
