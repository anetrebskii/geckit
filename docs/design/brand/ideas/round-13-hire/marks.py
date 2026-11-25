import os
HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "svg")
INK, RED, WT = "#16191D", "#E5322D", "#FFFFFF"


def tie(col, x=128, top=118, w=24, h=96):
    k = w * 0.9
    return (f'<path d="M{x-k/2} {top} L{x+k/2} {top} L{x+k*0.38} {top+k*0.8} L{x-k*0.38} {top+k*0.8} Z" fill="{col}"/>'
            f'<path d="M{x-k*0.34} {top+k*0.86} L{x+k*0.34} {top+k*0.86} L{x+w/2} {top+h-w*0.7} L{x} {top+h} L{x-w/2} {top+h-w*0.7} Z" fill="{col}"/>')


def suit(jacket, tiec, gap):
    return (f'<path d="M14 300 L22 196 Q30 146 90 124 L128 222 L166 124 Q226 146 234 196 L242 300 Z" fill="{jacket}"/>'
            f'<path d="M94 120 L128 140 L162 120 L128 222 Z" fill="{gap}"/>'
            + tie(tiec, top=132, w=32, h=88))


def big_tie(col):
    return tie(col, x=128, top=36, w=64, h=188)


def org(box, new, line):
    return (f'<rect x="96" y="40" width="64" height="52" rx="12" fill="{box}"/>'
            f'<path d="M128 92 L128 124 M64 124 L192 124 M64 124 L64 152 M192 124 L192 152" stroke="{line}" stroke-width="12" stroke-linecap="round" fill="none"/>'
            f'<rect x="32" y="152" width="64" height="52" rx="12" fill="{box}"/>'
            f'<rect x="160" y="152" width="64" height="52" rx="12" fill="{new}"/>')


def svg(body, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><title>{title}</title>{body}</svg>'


def clip(bg, art, rx=58):
    return f'<defs><clipPath id="t"><rect width="256" height="256" rx="{rx}"/></clipPath></defs><g clip-path="url(#t)"><rect width="256" height="256" fill="{bg}"/>{art}</g>'


MARKS = {
    "a-suit": ("пустой костюм", lambda m: {"color": clip("#F1EFEA", suit(INK, RED, WT)), "black": clip("#FFF", suit("#000", "#000", "#FFF"), 0), "rev": clip(INK, suit(WT, WT, INK), 0)}[m]),
    "a2-suit-red": ("пустой костюм, красный", lambda m: {"color": clip(RED, suit(INK, RED, WT)), "black": clip("#FFF", suit("#000", "#000", "#FFF"), 0), "rev": clip(INK, suit(WT, WT, INK), 0)}[m]),
    "b-tie": ("галстук", lambda m: {"color": clip(INK, big_tie(RED)), "black": big_tie("#000"), "rev": clip(INK, big_tie(WT), 0)}[m]),
    "c-org": ("место в оргструктуре", lambda m: {"color": clip(INK, org(WT, RED, WT)), "black": org("#000", "#000", "#000"), "rev": clip(INK, org(WT, WT, WT), 0)}[m]),
}
for k, (t, fn) in MARKS.items():
    open(f"{SVG}/{k}.svg", "w").write(svg(fn("color"), f"GeckIt, {t}"))
    open(f"{SVG}/{k}-black.svg", "w").write(svg(fn("black"), f"GeckIt, {t}, один цвет"))
    open(f"{SVG}/{k}-reversed.svg", "w").write(svg(fn("rev"), f"GeckIt, {t}, выворотка"))
