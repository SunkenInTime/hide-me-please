#!/usr/bin/env python3
"""
Remove a flat outer background (estimated from border pixels), trim transparency,
and center the artwork on a square PNG (common for extension icons).

Usage:
  pip install -r scripts/requirements.txt
  python scripts/process_icon.py
  python scripts/process_icon.py --input assets/icon.png --output assets/icon.png --tolerance 42
  python scripts/process_icon.py --trim-only --input assets/trasperent-icon.png --output assets/icon.png
  python scripts/process_icon.py --trim-only --input assets/trasperent-icon.png --square
  python scripts/process_icon.py --strip-margin --input assets/bg.image.png --output assets/icon.png
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


def estimate_background_rgb(rgba: np.ndarray, corner_px: int = 14) -> np.ndarray:
    """
    Average RGB from the four corner patches only (not full edges), so a centered
    subject does not pollute the background color when it touches top/bottom.
    """
    h, w = rgba.shape[:2]
    m = min(corner_px, h // 4, w // 4, h, w)
    if m < 1:
        m = 1
    patches = (
        rgba[:m, :m, :3],
        rgba[:m, -m:, :3],
        rgba[-m:, :m, :3],
        rgba[-m:, -m:, :3],
    )
    stacked = np.concatenate([p.reshape(-1, 3) for p in patches], axis=0)
    return np.mean(stacked.astype(np.float32), axis=0)


def remove_flat_background(
    rgba: np.ndarray, tolerance: float, corner_px: int
) -> np.ndarray:
    """
    Pixels whose RGB is within `tolerance` (Euclidean distance) of the estimated
    background become fully transparent. Existing alpha is multiplied in.
    """
    out = rgba.copy()
    bg = estimate_background_rgb(out, corner_px=corner_px)
    rgb = out[:, :, :3].astype(np.float32)
    dist = np.linalg.norm(rgb - bg, axis=2)
    mask = dist < tolerance
    a = out[:, :, 3].astype(np.float32)
    a[mask] = 0
    out[:, :, 3] = np.clip(a, 0, 255).astype(np.uint8)
    return out


def bbox_from_alpha(rgba: np.ndarray) -> tuple[int, int, int, int] | None:
    a = rgba[:, :, 3]
    ys, xs = np.where(a > 8)
    if ys.size == 0:
        return None
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    return x0, y0, x1, y1


def crop_to_content(img: Image.Image) -> Image.Image:
    rgba = np.array(img.convert("RGBA"))
    bbox = bbox_from_alpha(rgba)
    if bbox is None:
        return img
    return img.crop(bbox)


def pad_to_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    x = (side - w) // 2
    y = (side - h) // 2
    canvas.paste(img, (x, y), img)
    return canvas


def flood_remove_edge_white(rgba: np.ndarray, white_tol: float) -> np.ndarray:
    """
    Remove pixels that are (1) close to pure white and (2) connected to any image edge.
    Interior whites (e.g. a pillow) stay opaque because they are not 4-connected to the border
    through other white pixels.
    """
    out = rgba.copy()
    h, w = out.shape[:2]
    rgb = out[:, :, :3].astype(np.float32)
    white = np.array([255.0, 255.0, 255.0])
    dist = np.linalg.norm(rgb - white, axis=2)
    is_white_like = dist < white_tol

    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    def try_push(i: int, j: int) -> None:
        if not is_white_like[i, j] or visited[i, j]:
            return
        visited[i, j] = True
        q.append((i, j))

    for j in range(w):
        try_push(0, j)
        try_push(h - 1, j)
    for i in range(1, h - 1):
        try_push(i, 0)
        try_push(i, w - 1)

    while q:
        i, j = q.popleft()
        for di, dj in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            ni, nj = i + di, j + dj
            if 0 <= ni < h and 0 <= nj < w:
                try_push(ni, nj)

    a = out[:, :, 3].astype(np.float32)
    a[visited] = 0
    out[:, :, 3] = np.clip(a, 0, 255).astype(np.uint8)
    return out


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Remove outer background and square-crop an icon.")
    parser.add_argument(
        "--input",
        type=Path,
        default=root / "assets" / "icon.png",
        help="Source PNG (default: assets/icon.png)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=root / "assets" / "icon.png",
        help="Destination PNG (default: assets/icon.png)",
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=38.0,
        help="RGB distance below which pixels are treated as background (default: 38).",
    )
    parser.add_argument(
        "--corner-sample",
        type=int,
        default=14,
        metavar="PX",
        help="Size of each corner patch used to guess the background color (default: 14).",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="When overwriting --input, do not write icon.backup.png first.",
    )
    parser.add_argument(
        "--trim-only",
        action="store_true",
        help="Only crop empty transparent margins (no color-based background removal).",
    )
    parser.add_argument(
        "--square",
        action="store_true",
        help="After cropping, pad with transparency to a square (mostly used with --trim-only).",
    )
    parser.add_argument(
        "--strip-margin",
        action="store_true",
        help="Remove extra white margins connected to image edges (wide canvas with white sides).",
    )
    parser.add_argument(
        "--white-tol",
        type=float,
        default=26.0,
        help="RGB distance from pure white for --strip-margin flood fill (default: 26).",
    )
    args = parser.parse_args()

    in_path: Path = args.input
    out_path: Path = args.output
    if not in_path.is_file():
        raise SystemExit(f"Input not found: {in_path}")

    rgba = np.array(Image.open(in_path).convert("RGBA"))
    if args.trim_only:
        img = Image.fromarray(rgba, mode="RGBA")
        img = crop_to_content(img)
        if args.square:
            img = pad_to_square(img)
    elif args.strip_margin:
        rgba = flood_remove_edge_white(rgba, white_tol=args.white_tol)
        img = Image.fromarray(rgba, mode="RGBA")
        img = crop_to_content(img)
        img = pad_to_square(img)
    else:
        rgba = remove_flat_background(rgba, args.tolerance, corner_px=args.corner_sample)
        img = Image.fromarray(rgba, mode="RGBA")
        img = crop_to_content(img)
        img = pad_to_square(img)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if (
        out_path.resolve() == in_path.resolve()
        and in_path.is_file()
        and not args.no_backup
    ):
        backup = in_path.with_name(in_path.stem + ".backup.png")
        backup.write_bytes(in_path.read_bytes())

    img.save(out_path, format="PNG", optimize=True)
    print(f"Wrote {out_path} ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    main()
