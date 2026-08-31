"""
Reads layout structure out of the reference screenshots, since the images
themselves cannot be viewed. Reports, per screen:

  - horizontal bands: where the page changes character down the y axis
  - card edges: runs of rows/columns whose brightness steps up from the ground
  - text rows: rows with high horizontal variance (glyphs) vs flat rows
  - the left margin the content is set to
  - corner radius of the largest card
  - nav bar height and how many items it has

Everything is measured, nothing is guessed.
"""
import glob
import numpy as np
from PIL import Image

GROUND = 0.08  # luminance below this is the page ground


def lum(a):
    a = a / 255.0
    a = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def runs(mask, min_len):
    """contiguous True runs of at least min_len, as (start, end)"""
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    if start is not None and len(mask) - start >= min_len:
        out.append((start, len(mask)))
    return out


for f in sorted(glob.glob("design/ref-0*.jpeg")):
    im = Image.open(f).convert("RGB")
    W, H = im.size
    L = lum(np.asarray(im, dtype=np.float64))

    # crop the phone status bar and gesture bar out of the analysis
    top, bot = int(H * 0.035), int(H * 0.985)
    core = L[top:bot]
    h = core.shape[0]

    row_mean = core.mean(axis=1)
    row_var = core.var(axis=1)

    print(f"\n{'=' * 62}\n{f}   {W}x{H}")

    # --- surfaces lifted above the ground (cards) -------------------------
    lifted = row_mean > GROUND
    bands = runs(lifted, int(h * 0.012))
    print(f"  lifted bands (cards / media), as % of screen height:")
    for a, b in bands[:8]:
        strip = core[a:b]
        cols = strip.mean(axis=0) > GROUND
        cruns = runs(cols, int(W * 0.05))
        left = cruns[0][0] if cruns else 0
        right = cruns[-1][1] if cruns else W
        print(f"    y {100*(a+top)/H:5.1f}%-{100*(b+top)/H:5.1f}%  "
              f"h={b-a:4d}px  x {100*left/W:4.1f}%-{100*right/W:5.1f}%  "
              f"mean_lum={strip.mean():.3f}")

    # --- text rows --------------------------------------------------------
    text = row_var > row_var.mean() * 1.4
    trows = runs(text, 6)
    print(f"  text rows: {len(trows)}  (tallest {max((b-a) for a,b in trows) if trows else 0}px "
          f"-> largest type is roughly that many px)")

    # --- left margin ------------------------------------------------------
    col_var = core.var(axis=0)
    active = col_var > col_var.max() * 0.03
    cr = runs(active, 4)
    if cr:
        print(f"  content starts at x={cr[0][0]}px ({100*cr[0][0]/W:.1f}% of width), "
              f"ends x={cr[-1][1]}px ({100*cr[-1][1]/W:.1f}%)")

    # --- nav bar ----------------------------------------------------------
    nav = L[int(H * 0.90):int(H * 0.99)]
    navvar = nav.var(axis=0)
    items = runs(navvar > navvar.max() * 0.08, int(W * 0.02))
    print(f"  bottom bar: {len(items)} item clusters at x% "
          f"{[round(100*(a+b)/2/W) for a, b in items][:6]}")

    # --- corner radius of the biggest card --------------------------------
    if bands:
        a, b = max(bands, key=lambda r: r[1] - r[0])
        strip = core[a:b]
        cols = strip.mean(axis=0) > GROUND
        cruns = runs(cols, int(W * 0.05))
        if cruns and (b - a) > 40:
            x0 = cruns[0][0]
            # walk down the top-left corner: how far in is the first lit pixel
            inset = []
            for dy in range(0, 30):
                row = strip[dy] > GROUND
                lit = np.argmax(row[x0:x0 + 60]) if row[x0:x0 + 60].any() else 60
                inset.append(int(lit))
            radius = next((i for i, v in enumerate(inset) if v <= 1), len(inset))
            print(f"  largest card: {b-a}px tall, corner radius about {radius}px "
                  f"({radius / (W / 390):.0f}px at 390pt width)")
