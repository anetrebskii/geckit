import pathlib, subprocess
OUT = pathlib.Path(__file__).parent
INK, GREEN, WHITE = "#16191D", "#4AC85C", "#FFFFFF"
GT = 'transform="translate(48.63 199.67) scale(0.21395 -0.21395)"'
G_OPEN = "M488 262V58C462 56 443 55 433 55C279 55 185 160 185 340C185 515 277 619 426 619C455 619 482 614 509 603L524 585L543 479H616V649C542 671 471 682 405 682C183 682 40 545 40 340C40 132 182 -12 392 -12C465 -12 539 2 616 29V262Z"

def card_g(fg, accent):
    return (f'<path {GT} d="{G_OPEN}" fill="{fg}"/>'
            f'<g {GT}><rect x="318" y="300" width="300" height="118" rx="26" fill="{accent}"/></g>')

def card_g_out(fg, accent):
    return (f'<path {GT} d="{G_OPEN}" fill="{fg}"/>'
            f'<g {GT}><rect x="300" y="292" width="420" height="150" rx="30" fill="{accent}"/></g>')

def kanban(fg, accent):
    return (f'<rect x="52" y="56" width="40" height="144" rx="12" fill="{fg}"/>'
            f'<rect x="108" y="56" width="40" height="96" rx="12" fill="{fg}"/>'
            f'<rect x="164" y="56" width="40" height="60" rx="12" fill="{accent}"/>')

def stack(fg, accent):
    return (f'<rect x="48" y="52" width="132" height="40" rx="12" fill="{fg}"/>'
            f'<rect x="84" y="108" width="132" height="40" rx="12" fill="{accent}"/>'
            f'<rect x="48" y="164" width="132" height="40" rx="12" fill="{fg}"/>')

def handoff(fg, accent, bg):
    return (f'<rect x="44" y="92" width="112" height="120" rx="16" fill="{fg}"/>'
            f'<rect x="92" y="36" width="124" height="132" rx="18" fill="{bg}"/>'
            f'<rect x="104" y="48" width="100" height="108" rx="12" fill="{accent}"/>')

MARKS = {"a-card-g": card_g, "a2-card-out": card_g_out, "c-kanban-first": kanban, "b-stack": stack, "d-handoff": handoff}

def svg(body, bg=None, tile=False):
    back = f'<rect width="256" height="256" rx="58" fill="{INK}"/>' if tile else (f'<rect width="256" height="256" fill="{bg}"/>' if bg else "")
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">{back}{body}</svg>'

def body(name, fg, accent, bg):
    f = MARKS[name]
    return f(fg, accent, bg) if name == "d-handoff" else f(fg, accent)

for name in MARKS:
    variants = {
        "tile": svg(body(name, WHITE, GREEN, INK), tile=True),
        "mono": svg(body(name, INK, INK, WHITE), bg=WHITE),
        "reversed": svg(body(name, WHITE, WHITE, INK), bg=INK),
    }
    for v, s in variants.items():
        p = OUT / "svg" / f"{name}-{v}.svg"
        p.write_text(s)
        for px in (512, 32, 16):
            png = OUT / "work" / f"{name}-{v}-{px}.png"
            subprocess.run(["rsvg-convert", "-w", str(px), "-h", str(px), str(p), "-o", str(png)], check=True)
            if px < 512:
                subprocess.run(["magick", str(png), "-filter", "point", "-resize", "256x256", str(OUT / "work" / f"{name}-{v}-{px}-zoom.png")], check=True)
