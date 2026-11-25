import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "round-10-wordmark"))
import word
FACE = "xcharter-bold"
INK, WT = "#16191D", "#FFFFFF"
GR_LIGHT, GR_DARK = "#1F8031", "#4AC85C"
GLOBAL = -18
PAIRS = {0: 4, 1: 22, 2: 10, 3: 36, 4: 0}
TRACK = {i: GLOBAL + d for i, d in PAIRS.items()}
CAP = word.font(FACE)["OS/2"].sCapHeight / 1000


def svg(body, w, h, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}"><title>{title}</title>{body}</svg>'


def wordmark(fill, size, x, y):
    return word.word(FACE, "GeckIt", size, x, y, fill, track=TRACK)


def g_path(fill, size=256, scale=0.58, bold=0):
    d, adv, b = word.glyph(FACE, "G")
    gh = b[3] - b[1]
    s = size * scale / gh
    gw = (b[2] - b[0]) * s
    tx = (size - gw) / 2 - b[0] * s - size * 0.005
    ty = size / 2 + (gh * s) / 2 + b[1] * s
    st = f' stroke="{fill}" stroke-width="{bold}" stroke-linejoin="round"' if bold else ""
    return f'<path transform="translate({tx:.2f} {ty:.2f}) scale({s:.5f} {-s:.5f})" d="{d}" fill="{fill}"{st}/>'


ICONS = {
    "white-on-green": (GR_LIGHT, WT),
    "green-on-ink": (INK, GR_DARK),
}


def icon(kind, bold=0, rx=58):
    bg, fg = ICONS[kind]
    return f'<rect width="256" height="256" rx="{rx}" fill="{bg}"/>' + g_path(fg, bold=bold)


def lockup(kind, bg, fg, size=100):
    cap = CAP * size
    ih = cap * 1.55
    x0 = 40
    y_base = 40 + (ih + cap) / 2
    iy = y_base - cap / 2 - ih / 2
    wm, adv = wordmark(fg, size, x0 + ih + ih * 0.32, y_base)
    w = x0 + ih + ih * 0.32 + adv + 40
    h = ih + 80
    ic = f'<svg x="{x0}" y="{iy:.2f}" width="{ih:.2f}" height="{ih:.2f}" viewBox="0 0 256 256">{icon(kind)}</svg>'
    return svg(f'<rect width="100%" height="100%" fill="{bg}"/>' + ic + wm, w, h, "GeckIt lockup")


if __name__ == "__main__":
    out = os.path.join(HERE, "svg")
    for name, bg, fg in (("light", WT, INK), ("dark", INK, WT)):
        wm, adv = wordmark(fg, 140, 40, 40 + CAP * 140)
        open(f"{out}/wordmark-{name}.svg", "w").write(svg(f'<rect width="100%" height="100%" fill="{bg}"/>' + wm, adv + 80, CAP * 140 + 80 + 140 * 0.02, "GeckIt wordmark"))
        for kind in ICONS:
            open(f"{out}/lockup-{kind}-{name}.svg", "w").write(lockup(kind, bg, fg))
    for kind in ICONS:
        open(f"{out}/icon-{kind}.svg", "w").write(svg(icon(kind), 256, 256, f"GeckIt icon {kind}"))
        open(f"{out}/icon-{kind}-small.svg", "w").write(svg(icon(kind, bold=14), 256, 256, f"GeckIt icon {kind}, drawn for 16-32 px"))
        bg, fg = ICONS[kind]
        open(f"{out}/avatar-{kind}.svg", "w").write(svg(f'<rect width="256" height="256" fill="{bg}"/>' + g_path(fg), 256, 256, f"GeckIt avatar {kind}"))
    open(f"{out}/icon-black.svg", "w").write(svg(g_path("#000"), 256, 256, "GeckIt icon, one colour"))
    open(f"{out}/icon-reversed.svg", "w").write(svg(f'<rect width="256" height="256" fill="{INK}"/>' + g_path(WT), 256, 256, "GeckIt icon, reversed"))
