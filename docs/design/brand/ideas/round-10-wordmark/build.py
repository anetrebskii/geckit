import os, subprocess, word
HERE = os.path.dirname(os.path.abspath(__file__))
SVG, W = os.path.join(HERE, "svg"), os.path.join(HERE, "work")
INK, GR, WT = "#16191D", "#2FA84F", "#FFFFFF"
SLAB = "galvji-bold"


def svg(body, w, h, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><title>{title}</title>{body}</svg>'


def slab_word(fill, size=100, x=0, y=0, colors=None):
    g, adv = word.word(SLAB, "GeckIt", size, x, y, fill, track={0: -10, 2: -30, 3: 60, 4: 120}, colors=colors)
    f = word.font(SLAB)
    s = size / f["head"].unitsPerEm
    _, wI, bI = word.glyph(SLAB, "I")
    adv_before = sum(word.glyph(SLAB, c)[1] for c in "Geck") + (-10 - 30 + 60)
    ix0 = x + (adv_before + bI[0]) * s
    ix1 = x + (adv_before + bI[2]) * s
    cap = bI[3] * s
    stem = ix1 - ix0
    col = (colors or {}).get(4, fill)
    serif = f'<rect x="{ix0 - stem*0.55:.2f}" y="{y - cap:.2f}" width="{stem*2.1:.2f}" height="{stem*0.62:.2f}" fill="{col}"/><rect x="{ix0 - stem*0.55:.2f}" y="{y - stem*0.62:.2f}" width="{stem*2.1:.2f}" height="{stem*0.62:.2f}" fill="{col}"/>'
    return g + serif, adv


DIRS = {
    "a-antiqua": dict(face="charter-black", track={0: -20, 1: -10, 2: -15, 3: 75, 4: -5}, colors=None),
    "b-slab-i": dict(face=None),
    "a2-xcharter": dict(face="xcharter-bold", track={0: -20, 1: -10, 2: -15, 3: 35, 4: -5}, colors=None),
    "c-it": dict(face="charter-black", track={0: -20, 1: -10, 2: -15, 3: 75, 4: -5}, colors={4: GR, 5: GR}),
}


def wordmark(k, fill, size, x, y, green=True):
    d = DIRS[k]
    cols = d.get("colors") if green else None
    if d["face"] is None:
        return slab_word(fill, size, x, y, cols)
    return word.word(d["face"], "GeckIt", size, x, y, fill, track=d["track"], colors=cols)


def icon_g(k, fill, size=256):
    face = DIRS[k]["face"] or SLAB
    d, adv, b = word.glyph(face, "G")
    f = word.font(face)
    gh = b[3] - b[1]
    s = size * 0.56 / gh
    gw = (b[2] - b[0]) * s
    tx = (size - gw) / 2 - b[0] * s
    ty = size / 2 + (gh * s) / 2 + b[1] * s
    return f'<path transform="translate({tx:.2f} {ty:.2f}) scale({s:.5f} {-s:.5f})" d="{d}" fill="{fill}"/>'


def tile(bg, art):
    return f'<rect width="256" height="256" rx="58" fill="{bg}"/>{art}'


for k in DIRS:
    tb = GR if k != "c-it" else INK
    gf = WT
    open(f"{SVG}/{k}-icon.svg", "w").write(svg(tile(tb, icon_g(k, gf)), 256, 256, f"GeckIt {k}, icon"))
    open(f"{SVG}/{k}-icon-black.svg", "w").write(svg(icon_g(k, "#000"), 256, 256, f"GeckIt {k}, one colour"))
    open(f"{SVG}/{k}-icon-reversed.svg", "w").write(svg(f'<rect width="256" height="256" fill="{INK}"/>' + icon_g(k, WT), 256, 256, f"GeckIt {k}, reversed"))
    for name, bg, fg in (("light", WT, INK), ("dark", INK, WT)):
        wm, adv = wordmark(k, fg, 140, 40, 150)
        open(f"{SVG}/{k}-wordmark-{name}.svg", "w").write(svg(f'<rect width="100%" height="100%" fill="{bg}"/>' + wm, int(adv + 80), 200, f"GeckIt {k}, wordmark"))
        ic = f'<svg x="40" y="44" width="112" height="112" viewBox="0 0 256 256">{tile(tb, icon_g(k, gf))}</svg>'
        wm2, adv2 = wordmark(k, fg, 100, 176, 136)
        open(f"{SVG}/{k}-lockup-{name}.svg", "w").write(svg(f'<rect width="100%" height="100%" fill="{bg}"/>' + ic + wm2, int(176 + adv2 + 40), 200, f"GeckIt {k}, lockup"))
