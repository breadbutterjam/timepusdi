#!/usr/bin/env python3
"""
heic_to_jpeg.py - convert iPhone HEIC/HEIF photos to JPEG so Kept can use them.

Runs entirely on your computer. Nothing is uploaded.
Keeps the photo's date, location and other metadata, and keeps the folder structure.
Your originals are never changed.

Setup (once):
    pip install pillow pillow-heif

Use:
    python heic_to_jpeg.py "C:\\Photos\\Goa trip"                  -> writes "C:\\Photos\\Goa trip (jpeg)"
    python heic_to_jpeg.py "C:\\Photos\\Goa trip" "D:\\Goa-jpeg"   -> writes to a folder you choose
    python heic_to_jpeg.py "C:\\Photos\\Goa trip" --copy-jpegs     -> also copies existing JPEG/PNG/WebP files,
                                                                        so the output folder is ready to import as-is
"""

import argparse
import os
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image
    from pillow_heif import register_heif_opener
except ImportError:
    sys.exit("Missing packages. Run:  pip install pillow pillow-heif")

register_heif_opener()

# ---- Tunable ----
QUALITY = 92          # JPEG quality, 1-100
HEIC_EXT = {".heic", ".heif"}
OTHER_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def convert(src: Path, dst: Path) -> None:
    with Image.open(src) as im:
        exif = im.info.get("exif")
        icc = im.info.get("icc_profile")
        rgb = im.convert("RGB")
        kwargs = {"quality": QUALITY, "optimize": True}
        if exif:
            kwargs["exif"] = exif
        if icc:
            kwargs["icc_profile"] = icc
        dst.parent.mkdir(parents=True, exist_ok=True)
        rgb.save(dst, "JPEG", **kwargs)
    # keep the original file time so photos without metadata still sort correctly
    st = src.stat()
    os.utime(dst, (st.st_atime, st.st_mtime))


def main() -> int:
    ap = argparse.ArgumentParser(description="Convert HEIC photos to JPEG, keeping metadata.")
    ap.add_argument("source", type=Path, help="folder with HEIC photos (subfolders included)")
    ap.add_argument("output", type=Path, nargs="?", help="where to write JPEGs (default: '<source> (jpeg)')")
    ap.add_argument("--copy-jpegs", action="store_true", help="also copy existing JPEG/PNG/WebP files")
    ap.add_argument("--overwrite", action="store_true", help="replace files that already exist in the output")
    args = ap.parse_args()

    src_root = args.source.resolve()
    if not src_root.is_dir():
        return print(f"Not a folder: {src_root}") or 1
    out_root = (args.output or src_root.with_name(src_root.name + " (jpeg)")).resolve()
    if out_root == src_root or src_root in out_root.parents:
        return print("The output folder must be outside the source folder.") or 1

    converted = copied = skipped = failed = 0
    files = sorted(p for p in src_root.rglob("*") if p.is_file())
    for i, src in enumerate(files, 1):
        ext = src.suffix.lower()
        if ext not in HEIC_EXT and not (args.copy_jpegs and ext in OTHER_EXT):
            continue
        rel = src.relative_to(src_root)
        dst = out_root / (rel.with_suffix(".jpg") if ext in HEIC_EXT else rel)
        if dst.exists() and not args.overwrite:
            skipped += 1
            continue
        try:
            if ext in HEIC_EXT:
                convert(src, dst)
                converted += 1
            else:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
                copied += 1
        except Exception as e:  # keep going; report at the end
            failed += 1
            print(f"  could not convert {rel}: {e}")
        if (converted + copied) % 25 == 0 and (converted + copied):
            print(f"  {converted} converted...")

    print(f"\nDone. {converted} converted, {copied} copied, {skipped} already there, {failed} failed.")
    print(f"Output: {out_root}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
