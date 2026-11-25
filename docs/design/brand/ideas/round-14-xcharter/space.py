import subprocess, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "round-10-wordmark"))
import word
from PIL import Image
FACE = "xcharter-bold"
W = os.path.join(os.path.dirname(os.path.abspath(__file__)), "work")


def profile(ch):
    d, adv, b = word.glyph(FACE, ch)
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -800 {adv} 1000" width="{adv}" height="1000"><path transform="scale(1 -1)" d="{d}" fill="#000"/></svg>'
    p = os.path.join(W, f"g_{ord(ch)}.svg")
    open(p, "w").write(svg)
    subprocess.run(["rsvg-convert", "-b", "white", "-o", p + ".png", p], check=True)
    im = Image.open(p + ".png").convert("L")
    w, h = im.size
    px = im.load()
    left, right = {}, {}
    for y in range(h):
        xs = [x for x in range(w) if px[x, y] < 128]
        if xs:
            left[y], right[y] = xs[0], w - 1 - xs[-1]
    return adv, left, right


def area(a, b, gap, top, bot, depth):
    _, _, ra = a
    _, lb, _ = b
    tot = 0
    for y in range(top, bot):
        g = gap + min(ra.get(y, depth), depth) + min(lb.get(y, depth), depth)
        tot += min(g, gap + 2 * depth)
    return tot


if __name__ == "__main__":
    xh = word.font(FACE)["OS/2"].sxHeight
    top, bot = 800 - xh, 800
    depth = 90
    P = {c: profile(c) for c in "GeckItn"}
    ref = area(P["n"], P["n"], 0, top, bot, depth)
    print("ref nn", ref)
    word_ = "GeckIt"
    for i in range(5):
        a, b = P[word_[i]], P[word_[i + 1]]
        base = area(a, b, 0, top, bot, depth)
        delta = (ref - base) / (bot - top)
        print(word_[i] + word_[i + 1], "area", base, "track", round(delta))
