import json, math, os, re, shutil, subprocess, tempfile
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "geckit-logo")
ARCHIVE = os.path.join(HERE, "ideas", "geckit-logo-g")
TMP = tempfile.mkdtemp()
INK, WT, BLACK = "#16191D", "#FFFFFF", "#000000"
GR_DARK, GR_LIGHT = "#4AC85C", "#1F8031"
TILE_ON_DARK = "#2A2E34"

LEFT = "M22 32H66V50L46 46V90L66 86V104H22Q14 104 14 96V40Q14 32 22 32Z"
RIGHT = "M76 20H106Q114 20 114 28V84Q114 92 106 92H76V74L56 78V58L76 62Z"
WORD = re.findall(r'<path (transform="[^"]+") d="([^"]+)"', open(os.path.join(ARCHIVE, "logo", "geckit-wordmark-on-light.svg")).read())
WORD_BOX = (36, 19, 424, 126)


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


def svg(body, w, h, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><title>{title}</title>{body}</svg>'


def joint(left, right, box, x=0, y=0, scale=0.6):
    k = scale * box / 100
    return (f'<g transform="translate({x + box / 2:.2f} {y + box / 2:.2f}) scale({k:.5f}) translate(-64 -62)">'
            f'<path d="{LEFT}" fill="{left}"/><path d="{RIGHT}" fill="{right}"/></g>')


def word(fill, x, y, h):
    bx, by, bw, bh = WORD_BOX
    k = h / bh
    paths = "".join(f'<path {t} d="{d}" fill="{fill}"/>' for t, d in WORD)
    return f'<g transform="translate({x:.2f} {y:.2f}) scale({k:.5f}) translate({-bx} {-by})">{paths}</g>', bw * k


def lockup(left, right, ink):
    k = 97 / 84
    mark = (f'<g transform="translate(0 18) scale({k:.5f}) translate(-14 -20)">'
            f'<path d="{LEFT}" fill="{left}"/><path d="{RIGHT}" fill="{right}"/></g>')
    x = 100 * k + 30
    w, ww = word(ink, x, 0, 126)
    return mark + w, x + ww


def squircle(x, y, s, n=5, steps=360):
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, si = math.cos(t), math.sin(t)
        px = abs(c) ** (2 / n) * (1 if c >= 0 else -1)
        py = abs(si) ** (2 / n) * (1 if si >= 0 else -1)
        pts.append((x + s / 2 + px * s / 2, y + s / 2 + py * s / 2))
    return "M" + " L".join(f"{a:.2f} {c:.2f}" for a, c in pts) + " Z"


TILE_MARK = lambda box, x=0, y=0, bg=INK, rx=None: (f'<rect x="{x}" y="{y}" width="{box}" height="{box}" rx="{box * 58 / 256 if rx is None else rx:.2f}" fill="{bg}"/>'
                                                    + joint(WT, GR_DARK, box, x, y))

# logo
write(p("logo", "geckit-mark.svg"), svg(TILE_MARK(256), 256, 256, "GeckIt mark"))
write(p("logo", "geckit-joint-on-light.svg"), svg(joint(INK, GR_LIGHT, 256, scale=0.9), 256, 256, "GeckIt joint, on light"))
write(p("logo", "geckit-joint-on-dark.svg"), svg(joint(WT, GR_DARK, 256, scale=0.9), 256, 256, "GeckIt joint, on dark"))
write(p("logo", "geckit-joint-black.svg"), svg(joint(BLACK, BLACK, 256, scale=0.9), 256, 256, "GeckIt joint, one colour"))
write(p("logo", "geckit-joint-white.svg"), svg(joint(WT, WT, 256, scale=0.9), 256, 256, "GeckIt joint, white"))
for name, left, right, ink in (("on-light", INK, GR_LIGHT, INK), ("on-dark", WT, GR_DARK, WT), ("black", BLACK, BLACK, BLACK), ("white", WT, WT, WT)):
    body, w = lockup(left, right, ink)
    dst = write(p("logo", f"geckit-lockup-{name}.svg"), svg(body, round(w), 126, "GeckIt"))
    png(dst, dst.replace(".svg", "@2x.png"), 1200)
for name, ink in (("on-light", INK), ("on-dark", WT)):
    body, w = word(ink, 0, 0, 126)
    dst = write(p("logo", f"geckit-wordmark-{name}.svg"), svg(body, round(w), 126, "GeckIt wordmark"))
    png(dst, dst.replace(".svg", "@2x.png"), 1200)

# macOS legacy tile (1024, tile 824, pad 100, squircle n=5, shadow)
tile = squircle(100, 100, 824)
mac = (f'<defs><filter id="sh" x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur in="SourceAlpha" stdDeviation="10"/><feOffset dy="8"/>'
       f'<feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
       f'<path d="{tile}" fill="{INK}" filter="url(#sh)"/>' + joint(WT, GR_DARK, 824, 100, 100))
ms = write(p("app-icon", "macos", "icon-1024.svg"), svg(mac, 1024, 1024, "GeckIt macOS icon"))
mss = write(p("app-icon", "macos", "icon-small.svg"), svg(f'<path d="{tile}" fill="{INK}"/>' + joint(WT, GR_DARK, 824, 100, 100, scale=0.66), 1024, 1024, "GeckIt macOS icon, 16-32 px"))
iconset = os.path.join(TMP, "GeckIt.iconset")
os.makedirs(iconset)
for size in (16, 32, 128, 256, 512):
    for sc in (1, 2):
        px = size * sc
        png(mss if px <= 32 else ms, os.path.join(iconset, f"icon_{size}x{size}{'@2x' if sc == 2 else ''}.png"), px)
subprocess.run(["iconutil", "-c", "icns", iconset, "-o", p("app-icon", "macos", "icon.icns")], check=True)
png(ms, p("app-icon", "macos", "icon.png"), 1024)

# Dock icon of the build run from source: the same tile with an orange LOCAL band
dev = (mac.replace(joint(WT, GR_DARK, 824, 100, 100), joint(WT, GR_DARK, 824, 100, 12)).replace("</defs>", f'<clipPath id="t"><path d="{tile}"/></clipPath></defs>')
       + f'<rect x="100" y="748" width="824" height="116" fill="#E8701A" clip-path="url(#t)"/>'
       + '<text x="512" y="836" font-family="Helvetica Neue, Helvetica, Arial" font-size="88" font-weight="700" fill="#FFFFFF" text-anchor="middle">LOCAL</text>')
png(write(p("app-icon", "macos", "icon-dev.svg"), svg(dev, 1024, 1024, "GeckIt local build icon")), p("app-icon", "macos", "icon-dev.png"), 1024)

# macOS 26 Icon Composer bundle: each piece is its own glass layer
shutil.rmtree(p("app-icon", "macos", "icon.icon"), ignore_errors=True)
write(p("app-icon", "macos", "icon.icon", "Assets", "left.svg"), svg(joint(WT, "none", 1024), 1024, 1024, "GeckIt joint, left piece"))
write(p("app-icon", "macos", "icon.icon", "Assets", "right.svg"), svg(joint("none", GR_DARK, 1024), 1024, 1024, "GeckIt joint, right piece"))
srgb = lambda h: ",".join(f"{int(h[i:i + 2], 16) / 255:.5f}" for i in (1, 3, 5)) + ",1.00000"
write(p("app-icon", "macos", "icon.icon", "icon.json"), json.dumps({
    "fill": {"solid": f"extended-srgb:{srgb(INK)}"},
    "groups": [{"layers": [{"glass": True, "image-name": "right.svg", "name": "Right"},
                           {"glass": True, "image-name": "left.svg", "name": "Left"}],
                "shadow": {"kind": "neutral", "opacity": 0.5},
                "translucency": {"enabled": True, "value": 0.2}}],
    "supported-platforms": {"squares": "shared"}}, indent=2))

# Windows / Linux
wv = write(p("app-icon", "windows-linux", "icon.svg"), svg(TILE_MARK(992, 16, 16, rx=222), 1024, 1024, "GeckIt icon, Windows and Linux"))
wvs = write(p("app-icon", "windows-linux", "icon-small.svg"), svg(f'<rect width="1024" height="1024" rx="200" fill="{INK}"/>' + joint(WT, GR_DARK, 1024, scale=0.7), 1024, 1024, "GeckIt icon, Windows and Linux, small"))
shutil.rmtree(p("app-icon", "windows-linux", "icons"), ignore_errors=True)
ims = []
for s in (16, 24, 32, 48, 64, 96, 128, 256, 512, 1024):
    out = png(wvs if s <= 48 else wv, p("app-icon", "windows-linux", "icons", f"{s}x{s}.png"), s)
    if s <= 256:
        ims.append(Image.open(out).convert("RGBA"))
ims[-1].save(p("app-icon", "windows-linux", "icon.ico"), sizes=[(i.width, i.height) for i in ims], append_images=ims[:-1])

# iOS: full-bleed square
ios = write(p("app-icon", "ios", "AppIcon.svg"), svg(f'<rect width="1024" height="1024" fill="{INK}"/>' + joint(WT, GR_DARK, 1024, scale=0.56), 1024, 1024, "GeckIt iOS icon"))
png(ios, p("app-icon", "ios", "AppIcon-512@2x.png"), 1024)

# Android adaptive: 108dp canvas, mark inside the 66dp safe zone; legacy 48dp
fg = write(p("app-icon", "android", "ic_launcher_foreground.svg"), svg(joint(WT, GR_DARK, 108, scale=0.5), 108, 108, "GeckIt Android foreground"))
leg = write(p("app-icon", "android", "ic_launcher.svg"), svg(TILE_MARK(44, 2, 2, rx=9), 48, 48, "GeckIt Android legacy"))
rnd = write(p("app-icon", "android", "ic_launcher_round.svg"), svg(f'<circle cx="24" cy="24" r="22" fill="{INK}"/>' + joint(WT, GR_DARK, 44, 2, 2, scale=0.56), 48, 48, "GeckIt Android round"))
for d, k in (("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)):
    png(fg, p("app-icon", "android", f"mipmap-{d}", "ic_launcher_foreground.png"), int(108 * k))
    png(leg, p("app-icon", "android", f"mipmap-{d}", "ic_launcher.png"), int(48 * k))
    png(rnd, p("app-icon", "android", f"mipmap-{d}", "ic_launcher_round.png"), int(48 * k))
write(p("app-icon", "android", "ic_launcher_background.xml"), f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{INK}</color>\n</resources>\n')

# macOS menu bar template: black with alpha, 18/36
tray = write(p("app-icon", "tray", "trayTemplate.svg"), svg(joint(BLACK, BLACK, 18, scale=0.95), 18, 18, "GeckIt tray"))
png(tray, p("app-icon", "tray", "trayTemplate.png"), 18)
png(tray, p("app-icon", "tray", "trayTemplate@2x.png"), 36)

# Menu bar states: pulled apart while nothing works, joined while working, joined with a dot while something waits for the person
def tray_joint(scale, x=0, y=0, apart=0):
    k = scale * 18 / 100
    return (f'<g transform="translate({9 + x:.2f} {9 + y:.2f}) scale({k:.5f}) translate(-64 -62)">'
            f'<path d="{LEFT}" transform="translate({-apart} 0)" fill="{BLACK}"/><path d="{RIGHT}" transform="translate({apart} 0)" fill="{BLACK}"/></g>')


dot = '<circle cx="14.6" cy="3.4" r="3.0" fill="#000000"/>'
ring = '<mask id="m"><rect width="18" height="18" fill="#FFFFFF"/><circle cx="14.6" cy="3.4" r="4.4" fill="#000000"/></mask>'
for name, body in (("trayAsleepTemplate", tray_joint(0.8, apart=9)),
                   ("trayWorkingTemplate", tray_joint(0.95)),
                   ("trayWaitingTemplate", f'<defs>{ring}</defs><g mask="url(#m)">{tray_joint(0.9, -0.6, 0.8)}</g>{dot}')):
    src = write(p("app-icon", "tray", f"{name}.svg"), svg(body, 18, 18, "GeckIt tray"))
    png(src, p("app-icon", "tray", f"{name}.png"), 18)
    png(src, p("app-icon", "tray", f"{name}@2x.png"), 36)

# Web
fav = write(p("web", "favicon.svg"), svg(f'<rect width="256" height="256" rx="58" fill="{INK}"/>' + joint(WT, GR_DARK, 256, scale=0.7), 256, 256, "GeckIt"))
fims = [Image.open(png(fav, os.path.join(TMP, f"fav{s}.png"), s)).convert("RGBA") for s in (16, 32, 48)]
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
body, w = lockup(WT, GR_DARK, WT)
k = 760 / w
og = write(p("web", "og-image.svg"), svg(f'<rect width="1200" height="630" fill="{INK}"/><g transform="translate({(1200 - w * k) / 2:.1f} {(630 - 126 * k) / 2:.1f}) scale({k:.4f})">{body}</g>', 1200, 630, "GeckIt"))
png(og, p("web", "og-image.png"), 1200)

# Instagram: circle-safe
av = write(p("instagram", "geckit-avatar.svg"), svg(f'<rect width="256" height="256" fill="{INK}"/>' + joint(WT, GR_DARK, 256, scale=0.58), 256, 256, "GeckIt avatar"))
png(av, p("instagram", "geckit-avatar-1080.png"), 1080)
pk = 860 / w
post = write(p("instagram", "geckit-post-lockup.svg"), svg(f'<rect width="1080" height="1080" fill="{INK}"/><g transform="translate({(1080 - w * pk) / 2:.1f} {(1080 - 126 * pk) / 2:.1f}) scale({pk:.4f})">{body}</g>', 1080, 1080, "GeckIt"))
png(post, p("instagram", "geckit-post-lockup-1080.png"), 1080)

# Fonts: unchanged, carried over from the previous kit
if not os.path.isdir(p("fonts")):
    shutil.copytree(os.path.join(ARCHIVE, "fonts"), p("fonts"))
print("done")
