---
name: remove-bg-image
description: Remove the background from an image and produce a transparent PNG. Use this skill whenever the user asks to remove/delete a background, make an image transparent, create a cutout, sticker, or logo with no background — especially for flat illustrations, cartoons, AI-generated art, icons, or logos with a solid/uniform background. Also use it when AI background removal (rembg) is unavailable or its model download fails.
---

# Remove image background (flood-fill technique)

Turn an image with a uniform background into a transparent PNG. Works best on
flat illustrations, cartoons, logos, and AI-generated art where the background
is one (near-)solid color.

## Why this approach

A naive "delete every pixel close to the background color" fails on
illustrations: subjects often contain the same near-white color inside them
(a penguin's belly, a white door). The trick is **connectivity**: only remove
background-colored regions that are *connected to the image border*. Enclosed
same-colored areas survive automatically. This is fully offline — no ML model
download needed (useful when rembg's u2net model can't be fetched).

## Workflow

1. **Locate the file.** If the image was pasted into chat, there is no file to
   process — ask the user where it is on disk (often Downloads) and copy it
   into an accessible folder first.
2. **Check the background.** Sample the corners/edges. If they're roughly one
   color, use the script below. If the background is complex (photo, gradient,
   texture), this technique won't work — use an AI matting tool (rembg) or
   tell the user.
3. **Run the script:**

   ```bash
   pip install pillow numpy scipy --break-system-packages
   python scripts/remove_bg.py input.png output.png --preview check.jpg
   ```

4. **Verify visually — never skip this.** Open the preview (subject composited
   on blue) and actually look at it. Check:
   - subject and any props fully preserved (nothing "eaten")
   - no background remnants, including soft drop shadows
   - edges smooth, not jagged

5. **Tune tolerance if needed:**
   - Leftover soft drop shadow → raise `--tolerance` (e.g. 50 → 70). Shadows
     are slightly darker than the background but connected to it, so a higher
     tolerance sweeps them away while enclosed/distinct objects stay safe.
   - Parts of the subject disappearing → lower `--tolerance` (e.g. 50 → 25).
     This happens when subject colors are too close to the background AND
     touch the outer background region (e.g. a white object against off-white,
     a white face or paper map touching the background).
   - No setting works for both? Check if a clean threshold exists: histogram
     the color distances in the 15-65 band. If shadow and subject distances
     overlap (no gap), prefer the lower tolerance — keeping a faint shadow is
     far better than eating part of the subject.

6. **Batch jobs: verify EVERY image individually.** Tolerance is per-image,
   not per-batch — the same default that's clean on one illustration can eat
   a near-white face or prop on the next. Build a contact sheet of all
   previews and inspect it before delivering; rerun outliers with adjusted
   tolerance. Never ship results without this visual check — first-pass
   output is often subtly wrong in ways only eyes catch.

7. **Deliver** the transparent PNG next to the original or where the user
   asked. Match any naming convention already present in the folder
   (e.g. `<name>-transparent.png`), otherwise use `<name>-no-background.png`.

## Reference example

The penguin illustration this skill came from: background `rgb(253,250,246)`,
door `rgb(242,232,216)` (distance 59), drop shadow `rgb(245,238,225)`
(distance 41). Tolerance 50 removed background + shadow while the door
survived — the door was farther from the background color than the shadow.
That margin analysis (print a few sample pixels first) is how to pick a good
tolerance on tricky images. In a later batch, two of four same-style images
needed tolerance 25 instead — the visual check caught it.

## Stubborn leftovers: enclosed pockets and surviving shadows

Two defects the basic pass can leave behind (check on a DARK preview
background — near-white remnants are invisible on light/blue):

- **Enclosed background pockets** — gaps fully surrounded by the subject
  (e.g. between an arm and the head) never touch the border, so the flood
  fill keeps them. Fix: label the enclosed bg-colored components and remove
  those whose mean color distance from the background is tiny (< 8). Real
  subject whites (belly, paper) sit noticeably farther (~15+), so they
  survive. Keep a minimum size (~200 px) to avoid nuking small highlights.
- **Shadows that survive a lowered tolerance** — compute which extra pixels
  a higher tolerance (~60) would remove, label those components, and remove
  only the flat, wide ones (bbox height/width < 0.35, size > 1000). Ground
  shadows are flat ellipses; wrongly-eaten subject patches (faces, paper)
  are tall or round, so the shape test separates them.

Both checks are cheap and safe to run on every image by default.
