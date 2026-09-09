#!/usr/bin/env python3
"""Remove a uniform background from a flat illustration / logo / cartoon.

Technique: detect the background color from the image border, mark all pixels
within a color tolerance of it, then keep ONLY the regions connected to the
border (flood fill). Enclosed areas of the same color (e.g. a white belly
inside a black outline) survive because they don't touch the border.
Edges get a short alpha ramp so the cutout stays anti-aliased.

Usage:
    python remove_bg.py input.png output.png [--tolerance 50]

Deps: pip install pillow numpy scipy
"""
import argparse

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.ndimage import binary_dilation


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input")
    p.add_argument("output")
    p.add_argument("--tolerance", type=int, default=50,
                   help="Max summed RGB distance from bg color (default 50). "
                        "Raise to also catch soft drop shadows; lower if "
                        "near-background objects are being eaten.")
    p.add_argument("--preview", metavar="PATH",
                   help="Also save a preview composited on a blue background "
                        "for quick visual verification.")
    args = p.parse_args()

    img = Image.open(args.input).convert("RGB")
    a = np.asarray(img).astype(np.int16)

    # Background color = median of border pixels (robust to stray objects)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0).astype(np.int16)

    dist = np.abs(a - bg).sum(axis=2)
    close = dist < args.tolerance

    # Flood fill: keep only bg-colored regions connected to the image border
    lbl, _ = ndimage.label(close)
    border_labels = np.unique(
        np.concatenate([lbl[0], lbl[-1], lbl[:, 0], lbl[:, -1]]))
    border_labels = border_labels[border_labels != 0]
    bgmask = np.isin(lbl, border_labels)

    alpha = np.where(bgmask, 0, 255).astype(np.uint8)

    # Feather the cut edge so it stays anti-aliased
    edge = binary_dilation(bgmask, iterations=2) & ~bgmask
    lo, span = args.tolerance * 0.6, args.tolerance * 1.2
    ramp = np.clip((dist - lo) * 255 / span, 0, 255).astype(np.uint8)
    alpha[edge] = np.minimum(alpha[edge], np.maximum(ramp[edge], 60))

    out = np.dstack([np.asarray(img), alpha])
    Image.fromarray(out, "RGBA").save(args.output)
    print(f"bg color {tuple(int(x) for x in bg)}, "
          f"removed {bgmask.mean():.1%} of pixels -> {args.output}")

    if args.preview:
        chk = Image.new("RGBA", img.size, (90, 140, 200, 255))
        chk.alpha_composite(Image.open(args.output))
        chk.convert("RGB").save(args.preview, quality=85)
        print(f"preview -> {args.preview}")


if __name__ == "__main__":
    main()
