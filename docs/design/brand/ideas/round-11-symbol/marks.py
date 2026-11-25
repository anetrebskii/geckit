import os
HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "svg")
INK, GR, WT = "#16191D", "#2FA84F", "#FFFFFF"


def badge(card, hole, photo, strap=None):
    strap = strap or card
    return (f'<path d="M100 -20 L100 70 Q100 86 116 86 L140 86 Q156 86 156 70 L156 -20" stroke="{strap}" stroke-width="24" fill="none"/>'
            f'<rect x="112" y="76" width="32" height="34" rx="6" fill="{strap}"/>'
            f'<rect x="74" y="100" width="108" height="140" rx="18" fill="{card}"/>'
            f'<rect x="110" y="114" width="36" height="10" rx="5" fill="{hole}"/>'
            f'<rect x="98" y="138" width="60" height="60" rx="30" fill="{photo}"/>'
            f'<rect x="96" y="210" width="64" height="12" rx="6" fill="{hole}"/>')



def team(a, b, edge):
    out = []
    for i, x in enumerate((70, 128)):
        out.append(f'<circle cx="{x}" cy="128" r="46" fill="{a}" stroke="{edge}" stroke-width="12"/>')
    out.append(f'<circle cx="186" cy="128" r="46" fill="{b}" stroke="{edge}" stroke-width="12"/>')
    return "".join(out)


def eye(white, iris, pupil):
    return (f'<path d="M24 128 C 64 64 192 64 232 128 C 192 192 64 192 24 128 Z" fill="{white}"/>'
            f'<circle cx="128" cy="128" r="50" fill="{iris}"/>'
            f'<path d="M128 84 C 140 104 140 152 128 172 C 116 152 116 104 128 84 Z" fill="{pupil}"/>')


def svg(body, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><title>{title}</title>{body}</svg>'


def tile(bg, art, clip=False):
    if clip:
        return f'<defs><clipPath id="t"><rect width="256" height="256" rx="58"/></clipPath></defs><g clip-path="url(#t)"><rect width="256" height="256" fill="{bg}"/>{art}</g>'
    return f'<rect width="256" height="256" rx="58" fill="{bg}"/><g transform="translate(128 128) scale(0.86) translate(-128 -128)">{art}</g>'


MARKS = {
    "a-badge": ("пропуск", lambda m: {"color": tile(INK, badge(WT, INK, GR, GR), clip=True), "black": '<defs><clipPath id="t"><rect width="256" height="256"/></clipPath></defs><g clip-path="url(#t)">' + badge("#000", "#FFF", "#FFF") + "</g>", "rev": '<g clip-path="url(#r)"><defs><clipPath id="r"><rect width="256" height="256"/></clipPath></defs>' + badge(WT, INK, INK) + "</g>"}[m]),
    "b-team": ("новый в команде", lambda m: {"color": tile(INK, team(WT, GR, INK)), "black": team("#000", "#000", "#FFF"), "rev": team(WT, WT, INK)}[m]),
    "c-eye": ("ночная смена", lambda m: {"color": tile(INK, eye(WT, GR, INK)), "black": eye("#000", "#FFF", "#000"), "rev": eye(WT, INK, WT)}[m]),
}
for k, (t, fn) in MARKS.items():
    open(f"{SVG}/{k}.svg", "w").write(svg(fn("color"), f"GeckIt, {t}"))
    open(f"{SVG}/{k}-black.svg", "w").write(svg(fn("black"), f"GeckIt, {t}, один цвет"))
    open(f"{SVG}/{k}-reversed.svg", "w").write(svg(f'<rect width="256" height="256" fill="{INK}"/>' + fn("rev"), f"GeckIt, {t}, выворотка"))
