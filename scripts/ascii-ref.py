"""
Renders a reference screenshot as text so it can actually be read when the
image itself cannot be displayed. Two passes per image:

  1. a brightness ramp  — shows surfaces, cards and media blocks
  2. an edge map        — shows borders, dividers and text lines

Usage: python scripts/ascii-ref.py design/ref-01.jpeg [cols]
"""
import sys
import numpy as np
from PIL import Image

RAMP = " .:-=+*#%@"  # dark -> light


def lum(a):
    a = a / 255.0
    a = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def render(path, cols=64):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    # characters are about twice as tall as wide, so halve the row count
    rows = int(cols * (H / W) * 0.5)
    small = im.resize((cols, rows), Image.LANCZOS)
    L = lum(np.asarray(small, dtype=np.float64))

    # stretch contrast so a dark UI does not collapse into one ramp character
    lo, hi = np.percentile(L, 2), np.percentile(L, 98)
    N = np.clip((L - lo) / max(hi - lo, 1e-6), 0, 1)

    print(f"\n{'=' * (cols + 8)}\n{path}   {W}x{H}   brightness\n")
    for y in range(rows):
        line = "".join(RAMP[int(v * (len(RAMP) - 1))] for v in N[y])
        print(f"{100*y/rows:4.0f}% |{line}|")

    # Sobel-ish edge magnitude on the same grid: borders and text show as walls
    gy, gx = np.gradient(L)
    E = np.hypot(gx, gy)
    E = np.clip(E / max(np.percentile(E, 97), 1e-6), 0, 1)
    print(f"\n{path}   edges\n")
    for y in range(rows):
        line = "".join(" " if v < 0.22 else ("." if v < 0.45 else ("o" if v < 0.7 else "#")) for v in E[y])
        print(f"{100*y/rows:4.0f}% |{line}|")


if __name__ == "__main__":
    render(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 64)
