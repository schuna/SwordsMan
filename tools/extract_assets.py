"""
SwordsMan (1993, Soft-World / 소오강호) Complete Binary Asset Extractor
Extracts all original DOS game assets from sm/ into assets/extracted/
without modifying anything inside sm/.
"""

import os
import re
import json
import math
import wave
import array
import shutil
import struct
import argparse
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import List, Dict, Tuple, Optional, Any
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SM_DIR = ROOT / "sm"
OUT_DIR = ROOT / "assets" / "extracted"

# OPL2 constants
ADLIB_TICK_HZ = 1193182.0 / 16390.0  # ~72.799 Hz from ADLIB.BIN PIT init (0x4006)
VOC_SAMPLE_RATE = 8000
OPL_SAMPLE_RATE = 22050


def load_sm_lzss_tables() -> Tuple[bytes, bytes]:
    exe = (SM_DIR / "SM.EXE").read_bytes()
    return exe[0x6956:0x6956 + 23], exe[0x696D:0x696D + 16]


T_DIST, T_LEN = load_sm_lzss_tables()


def decompress_lzss(data: bytes) -> bytes:
    """Exact replica of SM.EXE 0x595:0x2d / 0x697d LZSS decompressor."""
    out = bytearray()
    pos = 0
    n = len(data)

    def get_byte() -> int:
        nonlocal pos
        b = data[pos]
        pos += 1
        return b

    def get_word() -> int:
        nonlocal pos
        w = data[pos] | (data[pos + 1] << 8)
        pos += 2
        return w

    ctrl = get_word()
    bits = 16

    def get_bit() -> int:
        nonlocal ctrl, bits
        b = ctrl & 1
        bits -= 1
        if bits == 0:
            if pos + 2 <= n:
                ctrl = get_word()
            else:
                ctrl = 0
            bits = 16
        else:
            ctrl >>= 1
        return b

    while True:
        if get_bit() == 0:
            out.append(get_byte())
        else:
            si = (get_bit() << 1) | get_bit()
            if si != 0:
                si = (si << 1) | get_bit()
                if si > 5:
                    si = (si << 1) | get_bit()
            si = T_LEN[si]
            if si == 10:
                si += get_byte()
                if si == 0x109:
                    break
            if si == 2 or get_bit() == 1:
                di = 0
            else:
                di = (get_bit() << 2) | (get_bit() << 1) | get_bit()
                if di > 1:
                    di = (di << 1) | get_bit()
                    if di > 7:
                        di = (di << 1) | get_bit()
                        if di > 0x16:
                            di = (((di << 1) | get_bit()) & 0xDF) << 8
                        else:
                            di = T_DIST[di] << 8
                    else:
                        di = T_DIST[di] << 8
                else:
                    di = T_DIST[di] << 8
            di |= get_byte()
            for _ in range(si):
                out.append(out[-di])
    return bytes(out)


def scale_vga_palette(raw768: bytes) -> List[Tuple[int, int, int]]:
    """Convert 768B 6-bit (or 8-bit if max > 63) VGA palette into 256 RGB tuples."""
    vals = list(raw768[:768])
    max_v = max(vals) if vals else 63
    use_6bit = max_v <= 63
    rgb = []
    for i in range(0, len(vals), 3):
        r, g, b = vals[i], vals[i + 1], vals[i + 2]
        if use_6bit:
            r = (r * 255) // 63
            g = (g * 255) // 63
            b = (b * 255) // 63
        rgb.append((r, g, b))
    return rgb


def decode_rle_69e0e(chunk: bytes) -> List[Tuple[int, int, int]]:
    """
    Decode SM.EXE 0x69e0e sparse RLE sprite/chunk onto 320-wide VGA buffer.
    Returns list of (x, y, color_index) pixels.
    """
    if len(chunk) < 4:
        return []
    di = struct.unpack_from("<H", chunk, 0)[0]
    pos = 2
    pts = []
    n = len(chunk)
    while pos + 2 <= n:
        skip = chunk[pos] | (chunk[pos + 1] << 8)
        pos += 2
        if skip == 0xFFFF:
            break
        di = (di + skip) & 0xFFFF
        if pos >= n:
            break
        run = chunk[pos]
        pos += 1
        end = min(pos + run, n)
        for k in range(end - pos):
            px_i = (di + k) & 0xFFFF
            pts.append((px_i % 320, px_i // 320, chunk[pos + k]))
        pos = end
        di = (di + run) & 0xFFFF
    return pts


def ensure_dirs() -> None:
    for sub in [
        "ui",
        "faces",
        "cutscenes",
        "cutscenes/gt",
        "cutscenes/tit",
        "cutscenes/em1",
        "cutscenes/em2",
        "cutscenes/em3",
        "cutscenes/d9",
        "world",
        "events",
        "audio/voc",
        "audio/adlib",
        "fonts",
    ]:
        (OUT_DIR / sub).mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# 1. Palettes & UI
# ---------------------------------------------------------------------------

def extract_ui_and_palettes() -> Tuple[List[Tuple[int, int, int]], Dict[str, Any]]:
    face_pal_raw = (SM_DIR / "FACE.PAL").read_bytes()
    face_rgb = scale_vga_palette(face_pal_raw)

    pal_idx_raw = (SM_DIR / "PAL.IDX").read_bytes()
    pal_idx_list = []
    for k in range(len(pal_idx_raw) // 768):
        chunk = pal_idx_raw[k * 768:(k + 1) * 768]
        rgb = scale_vga_palette(chunk)
        pal_idx_list.append(rgb)
        save_palette_swatch(rgb, OUT_DIR / "ui" / f"pal_idx_{k}.png")

    save_palette_swatch(face_rgb, OUT_DIR / "ui" / "face_pal_swatch.png")

    pal_json = {
        "face_pal": [list(c) for c in face_rgb],
        "pal_idx": [[list(c) for c in p] for p in pal_idx_list],
    }
    (OUT_DIR / "ui" / "palette.json").write_text(
        json.dumps(pal_json), encoding="utf-8"
    )

    # CFGLBM and CFGLBM0 (LZSS -> 64000 px + 768B palette)
    for name in ("CFGLBM", "CFGLBM0"):
        dec = decompress_lzss((SM_DIR / name).read_bytes())
        pal = scale_vga_palette(dec[64000:64768])
        img = Image.new("RGB", (320, 200))
        img.putdata([pal[b] for b in dec[:64000]])
        img.save(OUT_DIR / "ui" / f"{name.lower()}.png")

    # Copy protection sheets PASS01.PCX / PASS02.PCX / pass.PNG
    for pcx_name in ("PASS01.PCX", "PASS02.PCX"):
        im = Image.open(SM_DIR / pcx_name).convert("RGB")
        im.save(OUT_DIR / "ui" / (pcx_name.split(".")[0].lower() + ".png"))
    shutil.copy2(SM_DIR / "pass.PNG", OUT_DIR / "ui" / "pass_ref.png")

    return face_rgb, {
        "palettes": 1 + len(pal_idx_list),
        "screens": ["cfglbm.png", "cfglbm0.png", "pass01.png", "pass02.png", "pass_ref.png"],
    }


def save_palette_swatch(rgb: List[Tuple[int, int, int]], path: Path, cell: int = 16) -> None:
    im = Image.new("RGB", (16 * cell, 16 * cell))
    draw = ImageDraw.Draw(im)
    for idx, col in enumerate(rgb[:256]):
        r, c = divmod(idx, 16)
        x0, y0 = c * cell, r * cell
        draw.rectangle([x0, y0, x0 + cell - 1, y0 + cell - 1], fill=col)
    im.save(path)


# ---------------------------------------------------------------------------
# 2. Faces (FACE.GRP: 150 portraits @ 2654 bytes each)
# ---------------------------------------------------------------------------

def extract_faces(face_rgb: List[Tuple[int, int, int]]) -> Dict[str, Any]:
    raw = (SM_DIR / "FACE.GRP").read_bytes()
    rec_size = 2654
    count = len(raw) // rec_size
    cols = 15
    rows = (count + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * 50, rows * 50), (0, 0, 0, 0))

    for idx in range(count):
        chunk = raw[idx * rec_size:(idx + 1) * rec_size]
        pts = decode_rle_69e0e(chunk)
        # Portraits in FACE.GRP are 50x50 centered/offset at (di_x, di_y) -> normalize by min(x), min(y)
        if pts:
            min_x = min(p[0] for p in pts)
            min_y = min(p[1] for p in pts)
        else:
            min_x = min_y = 0
        im = Image.new("RGBA", (50, 50), (0, 0, 0, 0))
        px = im.load()
        for x, y, c in pts:
            lx, ly = x - min_x, y - min_y
            if 0 <= lx < 50 and 0 <= ly < 50:
                if c == 0:
                    px[lx, ly] = (0, 0, 0, 0)
                else:
                    r, g, b = face_rgb[c]
                    px[lx, ly] = (r, g, b, 255)
        im.save(OUT_DIR / "faces" / f"face_{idx:03d}.png")
        sr, sc = divmod(idx, cols)
        sheet.paste(im, (sc * 50, sr * 50))

    sheet.save(OUT_DIR / "faces" / "faces_sheet.png")
    return {"count": count, "width": 50, "height": 50, "sheet": "faces/faces_sheet.png"}


# ---------------------------------------------------------------------------
# 3. Cutscenes (GT, TIT, EM1, EM2, EM3, D9)
# ---------------------------------------------------------------------------

def read_idx_grp(idx_path: Path, grp_path: Path) -> List[bytes]:
    idx_raw = idx_path.read_bytes()
    ends = struct.unpack(f"<{len(idx_raw) // 4}I", idx_raw)
    grp_raw = grp_path.read_bytes()
    starts = [0] + list(ends[:-1])
    return [grp_raw[s:e] for s, e in zip(starts, ends)]


def decode_planar16_contiguous(
    chunk: bytes, palette16: List[Tuple[int, int, int]], plane_reverse: bool = False
) -> Image.Image:
    """Decode EGA/VGA 16-color 4-bitplane planar block (plane0..plane3 stored sequentially)."""
    w_bytes, h_lines = struct.unpack_from("<HH", chunk, 0)
    data = chunk[4:]
    plane_sz = w_bytes * h_lines
    planes = [data[p * plane_sz:(p + 1) * plane_sz] for p in range(4)]
    if plane_reverse:
        planes = planes[::-1]
    p0, p1, p2, p3 = planes
    w_px = w_bytes * 8
    im = Image.new("RGB", (w_px, h_lines))
    pix = im.load()
    for y in range(h_lines):
        row_off = y * w_bytes
        for xb in range(w_bytes):
            b0 = p0[row_off + xb]
            b1 = p1[row_off + xb]
            b2 = p2[row_off + xb]
            b3 = p3[row_off + xb]
            base_x = xb * 8
            for bit in range(8):
                shift = 7 - bit
                ci = (
                    ((b0 >> shift) & 1)
                    | (((b1 >> shift) & 1) << 1)
                    | (((b2 >> shift) & 1) << 2)
                    | (((b3 >> shift) & 1) << 3)
                )
                pix[base_x + bit, y] = palette16[ci]
    return im


def extract_gt_and_tit() -> Dict[str, Any]:
    # GT.GRP: 2 screens x [48B palette + 3 strips (25, 25, 30 bytes x 480 lines)] = 640x480
    gt_chunks = read_idx_grp(SM_DIR / "EM" / "GT.IDX", SM_DIR / "EM" / "GT.GRP")
    gt_files = []
    for s_idx, base in enumerate((0, 4)):
        pal16 = scale_vga_palette(gt_chunks[base] + b"\x00" * 720)[:16]
        canvas = Image.new("RGB", (640, 480))
        x_off = 0
        for part in (1, 2, 3):
            strip = decode_planar16_contiguous(gt_chunks[base + part], pal16, plane_reverse=False)
            canvas.paste(strip, (x_off, 0))
            x_off += strip.width
        out_name = f"gt_scene_{s_idx}.png"
        canvas.save(OUT_DIR / "cutscenes" / "gt" / out_name)
        gt_files.append(f"cutscenes/gt/{out_name}")

    # TIT.GRP: 2 x 64B palettes (first 48B RGB) + 56 planar halves (40x300 = 320x300 each) -> 28 frames (640x300)
    tit_chunks = read_idx_grp(SM_DIR / "EM" / "TIT.IDX", SM_DIR / "EM" / "TIT.GRP")
    tit_pal0 = scale_vga_palette(tit_chunks[0][:48] + b"\x00" * 720)[:16]
    tit_pal1 = scale_vga_palette(tit_chunks[1][:48] + b"\x00" * 720)[:16]
    tit_frames_imgs: List[Image.Image] = []
    tit_files = []
    for pair_idx in range(28):
        c_left = tit_chunks[2 + pair_idx * 2]
        c_right = tit_chunks[2 + pair_idx * 2 + 1]
        pal = tit_pal0 if pair_idx < 14 else tit_pal1
        im_l = decode_planar16_contiguous(c_left, pal, plane_reverse=False)
        im_r = decode_planar16_contiguous(c_right, pal, plane_reverse=False)
        frame = Image.new("RGB", (640, 300))
        frame.paste(im_l, (0, 0))
        frame.paste(im_r, (320, 0))
        fn = f"tit_frame_{pair_idx:02d}.png"
        frame.save(OUT_DIR / "cutscenes" / "tit" / fn)
        tit_files.append(f"cutscenes/tit/{fn}")
        tit_frames_imgs.append(frame)

    if tit_frames_imgs:
        tit_frames_imgs[0].save(
            OUT_DIR / "cutscenes" / "tit" / "tit_opening.gif",
            save_all=True,
            append_images=tit_frames_imgs[1:],
            duration=140,
            loop=0,
        )

    return {
        "gt": {"frames": gt_files, "width": 640, "height": 480},
        "tit": {
            "frames": tit_files,
            "gif": "cutscenes/tit/tit_opening.gif",
            "width": 640,
            "height": 300,
        },
    }


def apply_em_chunk(fb: bytearray, chunk: bytes) -> str:
    """Apply an EM1/EM2/EM3/D9 visual chunk to 64000-byte 320x200 indexed framebuffer."""
    n = len(chunk)
    if n == 64000:
        fb[:] = chunk
        return "keyframe"
    if n >= 4:
        w, h = struct.unpack_from("<HH", chunk, 0)
        if w * h + 4 == n and w > 0 and h > 0:
            # Color index 0xFF acts as chroma-key transparency in rect overlays
            pos = 4
            for y in range(min(h, 200)):
                row_fb = y * 320
                row_end = min(w, 320)
                for x in range(row_end):
                    val = chunk[pos + x]
                    if val != 0xFF:
                        fb[row_fb + x] = val
                pos += w
            return f"rect_{w}x{h}"

    if chunk[0] == 0xFF:
        pos = 1
        di = 0
        while pos + 2 <= n:
            skip = chunk[pos] | (chunk[pos + 1] << 8)
            pos += 2
            if skip == 0xFFFF:
                break
            di += skip
            if pos >= n:
                break
            run = chunk[pos]
            pos += 1
            for k in range(run):
                if pos + k < n and 0 <= di + k < 64000:
                    fb[di + k] = chunk[pos + k]
            pos += run
            di += run
        return "delta_ff"

    if chunk[0] == 0x00 and chunk[-2:] == b"\xff\xff":
        pos = 1
        di = 0
        while pos + 2 <= n:
            skip = chunk[pos] | (chunk[pos + 1] << 8)
            pos += 2
            if skip == 0xFFFF:
                break
            di += skip
            if pos + 2 > n:
                break
            cnt = chunk[pos]
            col = chunk[pos + 1]
            pos += 2
            for k in range(cnt):
                if 0 <= di + k < 64000:
                    fb[di + k] = col
            di += cnt
        return "delta_00"

    return "other"


def extract_em_cutscenes() -> Dict[str, Any]:
    results = {}
    configs = [
        ("em1", "EM1", 110),
        ("em2", "EM2", 100),
        ("em3", "EM3", 85),
        ("d9", "D9", 80),
    ]
    for slug, prefix, frame_ms in configs:
        chunks = read_idx_grp(SM_DIR / "EM" / f"{prefix}.IDX", SM_DIR / "EM" / f"{prefix}.GRP")
        pal = scale_vga_palette(chunks[0])
        flat_pal = []
        for r, g, b in pal:
            flat_pal.extend([r, g, b])

        fb = bytearray(64000)
        saved_frames: List[str] = []
        gif_imgs: List[Image.Image] = []
        last_bytes: Optional[bytes] = None
        frame_idx = 0

        for ci, chunk in enumerate(chunks[1:], start=1):
            if len(chunk) in (768, 4096):
                continue
            kind = apply_em_chunk(fb, chunk)
            snap = bytes(fb)
            if snap == last_bytes and kind != "keyframe":
                continue
            last_bytes = snap

            # Save PNGs for all non-duplicate frames (indexed P-mode PNGs are ~8-20KB each)
            im = Image.frombytes("P", (320, 200), snap)
            im.putpalette(flat_pal)
            fn = f"{slug}_{frame_idx:03d}.png"
            im.save(OUT_DIR / "cutscenes" / slug / fn, optimize=True)
            saved_frames.append(f"cutscenes/{slug}/{fn}")
            gif_imgs.append(im)
            frame_idx += 1

        if gif_imgs:
            # Cap GIF animation speed and size cleanly while keeping full sequence playable from PNG frames in web UI
            gif_step = 1 if len(gif_imgs) <= 150 else 2
            gif_subset = gif_imgs[::gif_step]
            gif_subset[0].save(
                OUT_DIR / "cutscenes" / slug / f"{slug}.gif",
                save_all=True,
                append_images=gif_subset[1:],
                duration=frame_ms * gif_step,
                loop=0,
                disposal=2,
            )

        results[slug] = {
            "name": prefix,
            "total_chunks": len(chunks),
            "frame_count": len(saved_frames),
            "frame_ms": frame_ms,
            "width": 320,
            "height": 200,
            "gif": f"cutscenes/{slug}/{slug}.gif",
            "frames": saved_frames,
        }
    return results


# ---------------------------------------------------------------------------
# 4. World Maps, STK, REGION
# ---------------------------------------------------------------------------

def extract_world(face_rgb: List[Tuple[int, int, int]]) -> Dict[str, Any]:
    maps_meta = []
    # Distinct pleasing pseudo-color table for tile IDs 0..255 (with tile 0 dark slate)
    tile_pal = [(12, 16, 24)]
    for i in range(1, 256):
        r = (i * 53 + 40) % 215 + 40
        g = (i * 97 + 60) % 215 + 40
        b = (i * 151 + 80) % 215 + 40
        tile_pal.append((r, g, b))

    stk_summary = []
    for ch in range(15):
        map_raw = decompress_lzss((SM_DIR / "MAP" / f"MAP.{ch}").read_bytes())
        assert len(map_raw) == 16384
        im = Image.new("RGB", (128, 128))
        im.putdata([tile_pal[b] for b in map_raw])
        im.save(OUT_DIR / "world" / f"map_{ch:02d}.png")

        unique_tiles = len(set(map_raw))
        non_zero = sum(1 for b in map_raw if b != 0)
        maps_meta.append({
            "chapter": ch,
            "image": f"world/map_{ch:02d}.png",
            "width": 128,
            "height": 128,
            "non_zero_cells": non_zero,
            "unique_tile_ids": unique_tiles,
        })

        stk_raw = decompress_lzss((SM_DIR / "STK" / f"STK.{ch}").read_bytes())
        stk_summary.append({
            "chapter": ch,
            "bytes": len(stk_raw),
            "non_zero": sum(1 for b in stk_raw if b != 0),
        })

    reg_raw = (SM_DIR / "REGION").read_bytes()
    seed_raw = decompress_lzss((SM_DIR / "SEED.TBL").read_bytes())
    status_raw = (SM_DIR / "STK" / "STATUS").read_bytes()

    world_meta = {
        "maps": maps_meta,
        "stk": stk_summary,
        "region": {
            "bytes": len(reg_raw),
            "rows": 200,
            "stride": 128,
            "non_zero": sum(1 for b in reg_raw if b != 0),
        },
        "seed_tbl_decompressed_bytes": len(seed_raw),
        "default_status_bytes": len(status_raw),
    }
    (OUT_DIR / "world" / "world_meta.json").write_text(
        json.dumps(world_meta, indent=2), encoding="utf-8"
    )
    return world_meta


# ---------------------------------------------------------------------------
# 5. Events: Korean Dialogues & Chapter Sprite Sheets (EVENT.0~14)
# ---------------------------------------------------------------------------

def extract_korean_strings(blob: bytes) -> List[str]:
    """Scan binary script/table entry for clean EUC-KR / ASCII dialogue/name segments."""
    out = []
    i = 0
    n = len(blob)
    while i < n:
        buf = bytearray()
        j = i
        has_hangul = False
        while j < n:
            b = blob[j]
            if b == 0:
                break
            if 0xB0 <= b <= 0xC8 and j + 1 < n and 0xA1 <= blob[j + 1] <= 0xFE:
                buf.extend((b, blob[j + 1]))
                has_hangul = True
                j += 2
            elif b in (0x0A, 0x0D) or 0x20 <= b <= 0x7E:
                buf.append(b)
                j += 1
            elif 0xA1 <= b <= 0xAC and j + 1 < n and 0xA1 <= blob[j + 1] <= 0xFE:
                buf.extend((b, blob[j + 1]))
                j += 2
            else:
                break
        if has_hangul and len(buf) >= 4:
            try:
                text = buf.decode("cp949", errors="ignore").strip()
                # Filter out tiny 1-char false positives
                hangul_chars = sum(1 for ch in text if "\uac00" <= ch <= "\ud7a3")
                if hangul_chars >= 2:
                    cleaned = re.sub(r"[\x00-\x09\x0b-\x1f]+", " ", text).strip()
                    if cleaned:
                        out.append(cleaned)
            except Exception:
                pass
            i = j + 1
        else:
            i += 1
    return out


def extract_events(face_rgb: List[Tuple[int, int, int]]) -> Dict[str, Any]:
    dialogues_all = []
    sprites_index = []
    total_sprites = 0
    total_dialogues = 0

    for ch in range(15):
        ev = decompress_lzss((SM_DIR / "EVENT" / f"EVENT.{ch}").read_bytes())
        hdr = struct.unpack_from("<16H", ev, 0)
        cnt = hdr[0]
        first_spr = hdr[15]
        offs = struct.unpack_from(f"<{cnt}I", ev, 32)

        ch_lines: List[Dict[str, Any]] = []
        seen_lines = set()
        for ei in range(min(first_spr, cnt)):
            s = offs[ei]
            e = offs[ei + 1] if ei + 1 < cnt else len(ev)
            for sline in extract_korean_strings(ev[s:e]):
                if sline not in seen_lines:
                    seen_lines.add(sline)
                    ch_lines.append({"entry": ei, "text": sline})

        total_dialogues += len(ch_lines)
        dialogues_all.append({
            "chapter": ch,
            "total_entries": cnt,
            "first_sprite_entry": first_spr,
            "line_count": len(ch_lines),
            "lines": ch_lines,
        })

        # Decode sprites into shelf-packed chapter sheet
        decoded: List[Tuple[int, Image.Image, int, int]] = []
        for si in range(first_spr, cnt):
            s = offs[si]
            e = offs[si + 1] if si + 1 < cnt else len(ev)
            pts = decode_rle_69e0e(ev[s:e])
            if not pts:
                continue
            min_x = min(p[0] for p in pts)
            max_x = max(p[0] for p in pts)
            min_y = min(p[1] for p in pts)
            max_y = max(p[1] for p in pts)
            w = max(1, max_x - min_x + 1)
            h = max(1, max_y - min_y + 1)
            if w > 320 or h > 200:
                continue
            im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            px = im.load()
            for x, y, c in pts:
                if c != 0:
                    r, g, b = face_rgb[c]
                    px[x - min_x, y - min_y] = (r, g, b, 255)
            decoded.append((si, im, min_x, min_y))

        # Shelf-pack into <= 1024px wide sprite sheet
        max_sheet_w = 1024
        pad = 2
        cur_x, cur_y, row_h = pad, pad, 0
        placements = []
        for si, im, ox, oy in decoded:
            if cur_x + im.width + pad > max_sheet_w:
                cur_x = pad
                cur_y += row_h + pad
                row_h = 0
            placements.append((si, im, cur_x, cur_y, ox, oy))
            cur_x += im.width + pad
            if im.height > row_h:
                row_h = im.height
        sheet_h = max(32, cur_y + row_h + pad)
        sheet = Image.new("RGBA", (max_sheet_w, sheet_h), (0, 0, 0, 0))
        sprite_entries = []
        for si, im, sx, sy, ox, oy in placements:
            sheet.paste(im, (sx, sy))
            sprite_entries.append({
                "id": si,
                "sx": sx,
                "sy": sy,
                "w": im.width,
                "h": im.height,
                "orig_x": ox,
                "orig_y": oy,
            })

        sheet_rel = f"events/event_{ch:02d}_sheet.png"
        sheet.save(OUT_DIR / sheet_rel, optimize=True)
        total_sprites += len(sprite_entries)
        sprites_index.append({
            "chapter": ch,
            "sheet": sheet_rel,
            "sheet_width": max_sheet_w,
            "sheet_height": sheet_h,
            "sprite_count": len(sprite_entries),
            "sprites": sprite_entries,
        })

    (OUT_DIR / "events" / "dialogues_ko.json").write_text(
        json.dumps({"total_lines": total_dialogues, "chapters": dialogues_all}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (OUT_DIR / "events" / "sprites_index.json").write_text(
        json.dumps({"total_sprites": total_sprites, "chapters": sprites_index}),
        encoding="utf-8",
    )
    return {"total_dialogues": total_dialogues, "total_sprites": total_sprites}


# ---------------------------------------------------------------------------
# 6. Audio: PCM VOC SFX + AdLib OPL2 Synthesizer + Standard MIDI
# ---------------------------------------------------------------------------

def write_pcm_wav_u8(data: bytes, path: Path, sample_rate: int = VOC_SAMPLE_RATE) -> float:
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(1)
        wf.setframerate(sample_rate)
        wf.writeframes(data)
    return len(data) / float(sample_rate)


def extract_voc_audio() -> List[Dict[str, Any]]:
    banks = [
        ("voc0", SM_DIR / "VOC" / "VOC0.IDX", SM_DIR / "VOC" / "VOC0.GRP", 14),  # entry 14 is 448KB DOS slack
        ("d9v", SM_DIR / "EM" / "D9V.IDX", SM_DIR / "EM" / "D9V.GRP", None),
        ("e1v", SM_DIR / "EM" / "E1V.IDX", SM_DIR / "EM" / "E1V.GRP", None),
        ("e2v", SM_DIR / "EM" / "E2V.IDX", SM_DIR / "EM" / "E2V.GRP", None),
        ("e3v", SM_DIR / "EM" / "E3V.IDX", SM_DIR / "EM" / "E3V.GRP", None),
    ]
    clips = []
    for prefix, idx_p, grp_p, limit in banks:
        chunks = read_idx_grp(idx_p, grp_p)
        if limit is not None:
            chunks = chunks[:limit]
        for i, chunk in enumerate(chunks):
            fn = f"{prefix}_{i:02d}.wav"
            out_p = OUT_DIR / "audio" / "voc" / fn
            dur = write_pcm_wav_u8(chunk, out_p, VOC_SAMPLE_RATE)
            clips.append({
                "id": f"{prefix}_{i:02d}",
                "bank": prefix.upper(),
                "index": i,
                "file": f"audio/voc/{fn}",
                "bytes": len(chunk),
                "sample_rate": VOC_SAMPLE_RATE,
                "duration_sec": round(dur, 3),
            })
    return clips


# OPL2 Sine / Waveform & Envelope FM Synthesizer matching ADLIB.BIN
FNUM_TABLE = [0x156, 0x16A, 0x180, 0x198, 0x1B0, 0x1CA, 0x1E4, 0x202, 0x220, 0x240, 0x262, 0x286]
MULT_TABLE = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 12, 12, 15, 15]
SIN_LUT_SIZE = 2048
SIN_LUT = [math.sin(2.0 * math.pi * i / SIN_LUT_SIZE) for i in range(SIN_LUT_SIZE)]


def opl_wave(phase_0_to_1: float, ws: int) -> float:
    idx = int(phase_0_to_1 * SIN_LUT_SIZE) & (SIN_LUT_SIZE - 1)
    s = SIN_LUT[idx]
    w = ws & 3
    if w == 0:
        return s
    if w == 1:
        return s if s > 0.0 else 0.0
    if w == 2:
        return abs(s)
    # w == 3: quarter sine pulses
    return abs(s) if (idx & (SIN_LUT_SIZE // 2 - 1)) < (SIN_LUT_SIZE // 4) else 0.0


def parse_adlib_events(buf: bytes) -> Tuple[List[Tuple[int, str, Any]], Dict[int, List[int]]]:
    """Parse ADLIB.BIN bytecode into timestamped events (tick, type, data) and patches."""
    pos = 0
    tick = 0
    events: List[Tuple[int, str, Any]] = []
    patches: Dict[int, List[int]] = {}
    n = len(buf)
    while pos < n:
        op = buf[pos]
        pos += 1
        cmd = op >> 4
        ch = op & 0x0F
        if cmd in (0, 1):
            if pos >= n:
                break
            tick += buf[pos]
            pos += 1
        elif cmd == 2:
            if pos + 14 > n:
                break
            patch = list(buf[pos:pos + 14])
            pos += 14
            patches[ch] = patch
            events.append((tick, "patch", (ch, patch)))
        elif cmd == 8:
            events.append((tick, "off", ch))
        elif cmd == 9:
            if pos >= n:
                break
            note = buf[pos]
            pos += 1
            events.append((tick, "on", (ch, note)))
        elif cmd == 0xA:
            if pos >= n:
                break
            vol = buf[pos]
            pos += 1
            events.append((tick, "vol", (ch, vol)))
        elif cmd == 0xC:
            if pos >= n:
                break
            inst = buf[pos]
            pos += 1
            events.append((tick, "inst", (ch, inst)))
        elif cmd == 0xE:
            if pos >= n:
                break
            det = buf[pos]
            pos += 1
            events.append((tick, "detune", (ch, det)))
        elif cmd == 0xF:
            events.append((tick, "end", op))
            break
    return events, patches


def export_adlib_to_midi(events: List[Tuple[int, str, Any]], out_path: Path) -> None:
    """Write a Standard MIDI Format 0 file preserving OPL2 note timings."""
    tpqn = 480
    # At 72.8 Hz ticks and 120 BPM (500,000 us/beat), 1 tick = 1/72.8 s = 13,736 us -> ~13.19 MIDI ticks per AdLib tick
    scale = tpqn / (0.5 * ADLIB_TICK_HZ)

    def encode_vlq(val: int) -> bytes:
        res = [val & 0x7F]
        val >>= 7
        while val:
            res.append((val & 0x7F) | 0x80)
            val >>= 7
        return bytes(reversed(res))

    track = bytearray()
    # Set Tempo = 500000 us/quarter
    track.extend(b"\x00\xff\x51\x03\x07\xa1\x20")
    active_notes: Dict[int, int] = {}
    last_midi_tick = 0

    for tick, etype, data in events:
        cur_midi_tick = int(round(tick * scale))
        delta = max(0, cur_midi_tick - last_midi_tick)
        if etype == "on":
            ch, note = data
            mch = ch & 0x0F
            if mch == 9:
                mch = 8  # avoid GM percussion mapping on melodic OPL channels
            if ch in active_notes:
                track.extend(encode_vlq(delta))
                track.extend(bytes([0x80 | mch, active_notes[ch] & 0x7F, 0]))
                delta = 0
            mnote = max(0, min(127, note + 12))
            track.extend(encode_vlq(delta))
            track.extend(bytes([0x90 | mch, mnote, 100]))
            active_notes[ch] = mnote
            last_midi_tick = cur_midi_tick
        elif etype == "off":
            ch = data
            mch = ch & 0x0F
            if mch == 9:
                mch = 8
            if ch in active_notes:
                track.extend(encode_vlq(delta))
                track.extend(bytes([0x80 | mch, active_notes.pop(ch) & 0x7F, 0]))
                last_midi_tick = cur_midi_tick
        elif etype == "inst":
            ch, inst = data
            mch = ch & 0x0F
            if mch == 9:
                mch = 8
            track.extend(encode_vlq(delta))
            track.extend(bytes([0xC0 | mch, inst & 0x7F]))
            last_midi_tick = cur_midi_tick

    for ch, mnote in list(active_notes.items()):
        mch = ch & 0x0F
        if mch == 9:
            mch = 8
        track.extend(encode_vlq(0))
        track.extend(bytes([0x80 | mch, mnote & 0x7F, 0]))
    track.extend(b"\x00\xff\x2f\x00")

    hdr = struct.pack(">4sIHHH", b"MThd", 6, 0, 1, tpqn)
    trk = struct.pack(">4sI", b"MTrk", len(track)) + bytes(track)
    out_path.write_bytes(hdr + trk)


class OPLChannel:
    def __init__(self) -> None:
        self.patch = [0x01, 0x10, 0xF1, 0x77, 0x00, 0x01, 0x00, 0xF1, 0x77, 0x00, 0x00]
        self.vol = 0x3F
        self.freq = 0.0
        self.gate = False
        self.ph_mod = 0.0
        self.ph_car = 0.0
        self.env_mod = 0.0
        self.env_car = 0.0
        self.prev_mod = 0.0


def rate_to_step(nibble: int, is_attack: bool, dt: float) -> float:
    if nibble == 0:
        return 0.0
    if is_attack:
        sec = 0.002 * (2.0 ** ((15 - nibble) * 0.55))
    else:
        sec = 0.015 * (2.0 ** ((15 - nibble) * 0.65))
    return min(1.0, dt / max(0.001, sec))


def render_opl2_wav(events: List[Tuple[int, str, Any]], out_path: Path) -> float:
    """Pure-Python 2-operator OPL2 FM synthesizer outputting 16-bit 22050Hz mono WAV."""
    sr = OPL_SAMPLE_RATE
    samples_per_tick = int(round(sr / ADLIB_TICK_HZ))  # 303 samples per tick (~13.7ms)
    patches: Dict[int, List[int]] = {}
    channels = [OPLChannel() for _ in range(11)]

    # Group events by tick
    by_tick: Dict[int, List[Tuple[str, Any]]] = {}
    max_tick = 0
    for tk, et, dat in events:
        by_tick.setdefault(tk, []).append((et, dat))
        if tk > max_tick:
            max_tick = tk
    total_ticks = max_tick + 30  # small tail for release

    pcm_blocks = bytearray()
    dt_env = 1.0 / ADLIB_TICK_HZ
    phase_dt = 1.0 / sr
    # Fast sample loop per tick (block size 303 samples) -> envelopes updated per tick (step smoothing), phase per sample
    two_pi_scale = 1.0 / (2.0 * math.pi)
    fb_scale = [0.0, 0.03, 0.06, 0.12, 0.25, 0.5, 1.0, 2.0]

    for tk in range(total_ticks + 1):
        for et, dat in by_tick.get(tk, ()):
            if et == "patch":
                slot, p = dat
                patches[slot] = p
            elif et == "inst":
                ch, slot = dat
                if ch < len(channels) and slot in patches:
                    channels[ch].patch = patches[slot]
            elif et == "vol":
                ch, v = dat
                if ch < len(channels):
                    channels[ch].vol = max(0, min(63, v))
            elif et == "on":
                ch, note = dat
                if ch < len(channels):
                    c = channels[ch]
                    fn = FNUM_TABLE[note % 12]
                    blk = max(0, min(7, (note // 12)))
                    # ADLIB note mapping: octave 4 (note ~48..59)
                    c.freq = fn * 49716.0 / float(1 << max(12, 21 - blk))
                    c.gate = True
                    c.env_mod = max(c.env_mod, 0.08)
                    c.env_car = max(c.env_car, 0.08)
            elif et == "off":
                ch = dat
                if ch < len(channels):
                    channels[ch].gate = False

        # Step envelopes once per tick (~72.8 Hz) for responsive speed and clean sound
        active: List[Tuple[OPLChannel, float, float, float, float, int, int, int, float]] = []
        for c in channels:
            p = c.patch
            ar_m, dr_m = (p[2] >> 4) & 0xF, p[2] & 0xF
            sl_m, rr_m = 1.0 - ((p[3] >> 4) & 0xF) / 15.0, p[3] & 0xF
            ar_c, dr_c = (p[7] >> 4) & 0xF, p[7] & 0xF
            sl_c, rr_c = 1.0 - ((p[8] >> 4) & 0xF) / 15.0, p[8] & 0xF

            if c.gate:
                if c.env_car < 0.999:
                    c.env_car = min(1.0, c.env_car + rate_to_step(ar_c, True, dt_env) * 2.5)
                else:
                    c.env_car = max(sl_c, c.env_car - rate_to_step(dr_c, False, dt_env))
                if c.env_mod < 0.999:
                    c.env_mod = min(1.0, c.env_mod + rate_to_step(ar_m, True, dt_env) * 2.5)
                else:
                    c.env_mod = max(sl_m, c.env_mod - rate_to_step(dr_m, False, dt_env))
            else:
                c.env_car = max(0.0, c.env_car - rate_to_step(max(2, rr_c), False, dt_env))
                c.env_mod = max(0.0, c.env_mod - rate_to_step(max(2, rr_m), False, dt_env))

            if c.env_car > 0.004 and c.freq > 15.0:
                tl_m = p[1] & 0x3F
                tl_c = p[6] & 0x3F
                mod_amp = c.env_mod * (10.0 ** (-tl_m * 0.75 / 20.0)) * 0.9
                car_amp = c.env_car * (10.0 ** (-tl_c * 0.75 / 20.0)) * (c.vol / 63.0)
                m_mult = MULT_TABLE[p[0] & 0xF]
                c_mult = MULT_TABLE[p[5] & 0xF]
                dp_m = c.freq * m_mult * phase_dt
                dp_c = c.freq * c_mult * phase_dt
                ws_m = p[4] & 3
                ws_c = p[9] & 3
                conn = p[10] & 1
                fb = fb_scale[(p[10] >> 1) & 7] * 0.25
                active.append((c, dp_m, dp_c, mod_amp, car_amp, ws_m, ws_c, conn, fb))

        if not active:
            pcm_blocks.extend(b"\x00\x00" * samples_per_tick)
            continue

        block = [0.0] * samples_per_tick
        lut = SIN_LUT
        lut_sz = SIN_LUT_SIZE
        mask = lut_sz - 1
        h_mask = (lut_sz >> 1) - 1
        q_lim = lut_sz >> 2
        pm_scale = two_pi_scale * 2.2
        for c, dp_m, dp_c, mod_amp, car_amp, ws_m, ws_c, conn, fb in active:
            pm = c.ph_mod
            pc = c.ph_car
            prev_m = c.prev_mod
            for i in range(samples_per_tick):
                im = int(((pm + prev_m * fb) % 1.0) * lut_sz) & mask
                m = lut[im]
                if ws_m == 1 and m < 0.0:
                    m = 0.0
                elif ws_m == 2 and m < 0.0:
                    m = -m
                elif ws_m == 3:
                    m = abs(m) if (im & h_mask) < q_lim else 0.0
                prev_m = m

                if conn == 1:
                    ic = int((pc % 1.0) * lut_sz) & mask
                    cv = lut[ic]
                    if ws_c == 1 and cv < 0.0:
                        cv = 0.0
                    elif ws_c == 2 and cv < 0.0:
                        cv = -cv
                    elif ws_c == 3:
                        cv = abs(cv) if (ic & h_mask) < q_lim else 0.0
                    out = (m * mod_amp * 0.5 + cv) * car_amp
                else:
                    ic = int(((pc + m * mod_amp * pm_scale) % 1.0) * lut_sz) & mask
                    cv = lut[ic]
                    if ws_c == 1 and cv < 0.0:
                        cv = 0.0
                    elif ws_c == 2 and cv < 0.0:
                        cv = -cv
                    elif ws_c == 3:
                        cv = abs(cv) if (ic & h_mask) < q_lim else 0.0
                    out = cv * car_amp
                block[i] += out
                pm = (pm + dp_m) % 1.0
                pc = (pc + dp_c) % 1.0
            c.ph_mod = pm
            c.ph_car = pc
            c.prev_mod = prev_m

        # Soft-clip mix and pack 16-bit LE PCM
        pcm_arr = array.array("h", (int(max(-32767, min(32767, math.tanh(s * 0.35) * 28000))) for s in block))
        pcm_blocks.extend(pcm_arr.tobytes())

    with wave.open(str(out_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(bytes(pcm_blocks))

    return (len(pcm_blocks) // 2) / float(sr)


def _process_one_adlib_track(task: Tuple[str, str, bytes, bool]) -> Dict[str, Any]:
    tid, title, buf, reuse_wav = task
    events, patches = parse_adlib_events(buf)
    mid_rel = f"audio/adlib/{tid}.mid"
    wav_rel = f"audio/adlib/{tid}.wav"
    export_adlib_to_midi(events, OUT_DIR / mid_rel)
    wav_path = OUT_DIR / wav_rel
    if reuse_wav and wav_path.exists() and wav_path.stat().st_size > 1000:
        with wave.open(str(wav_path), "rb") as wf:
            dur = wf.getnframes() / float(wf.getframerate())
    else:
        dur = render_opl2_wav(events, wav_path)
    max_tick = max((e[0] for e in events), default=0)
    note_count = sum(1 for e in events if e[1] == "on")
    return {
        "id": tid,
        "title": title,
        "raw_bytes": len(buf),
        "ticks": max_tick,
        "notes": note_count,
        "instruments": len(patches),
        "duration_sec": round(dur, 2),
        "midi": mid_rel,
        "wav": wav_rel,
    }


def extract_adlib_music(reuse_wav: bool = False) -> List[Dict[str, Any]]:
    tracks_raw: List[Tuple[str, str, bytes, bool]] = [
        ("tit_theme", "TIT.M (오프닝 서화 테마)", (SM_DIR / "EM" / "TIT.M").read_bytes(), reuse_wav),
        ("em1_theme", "EM1.M (인트로 1장)", (SM_DIR / "EM" / "EM1.M").read_bytes(), reuse_wav),
        ("d9_theme", "D9.M (소오강호 메인/엔딩)", (SM_DIR / "EM" / "D9.M").read_bytes(), reuse_wav),
    ]
    mfx_idx = struct.unpack("<16I", (SM_DIR / "MFX" / "MFX0.IDX").read_bytes())
    mfx_grp = decompress_lzss((SM_DIR / "MFX" / "MFX0.GRP").read_bytes())
    ms = [0] + list(mfx_idx[:-1])
    for i in range(16):
        tracks_raw.append((f"mfx0_{i:02d}", f"MFX0 Track #{i:02d}", mfx_grp[ms[i]:mfx_idx[i]], reuse_wav))

    with ProcessPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
        return list(pool.map(_process_one_adlib_track, tracks_raw))


# ---------------------------------------------------------------------------
# 7. Fonts (FONT.E16, EM/FONT.E16, KFONT.15)
# ---------------------------------------------------------------------------

def render_8x16_font_sheet(raw: bytes, out_path: Path) -> None:
    cols, rows = 16, 8
    im = Image.new("RGBA", (cols * 10, rows * 18), (12, 16, 24, 255))
    px = im.load()
    for ch in range(min(128, len(raw) // 16)):
        r_cell, c_cell = divmod(ch, cols)
        x0, y0 = c_cell * 10 + 1, r_cell * 18 + 1
        glyph = raw[ch * 16:(ch + 1) * 16]
        for y in range(16):
            row_b = glyph[y]
            for x in range(8):
                if (row_b >> (7 - x)) & 1:
                    px[x0 + x, y0 + y] = (230, 210, 160, 255)
    im.save(out_path)


def extract_fonts() -> Dict[str, Any]:
    e16 = (SM_DIR / "FONT.E16").read_bytes()
    em_e16 = (SM_DIR / "EM" / "FONT.E16").read_bytes()
    render_8x16_font_sheet(e16, OUT_DIR / "fonts" / "font_e16.png")
    render_8x16_font_sheet(em_e16, OUT_DIR / "fonts" / "font_em_e16.png")

    # KFONT.15: KS X 1001 16x16 glyphs (32 bytes each)
    kf = (SM_DIR / "KFONT.15").read_bytes()
    # Extract all 2,350 Hangul syllables (KS X 1001 rows 0xB0..0xC8, cols 0xA1..0xFE)
    hangul_map: Dict[str, str] = {}
    cols = 47
    rows = 50
    sheet = Image.new("RGBA", (cols * 16, rows * 16), (0, 0, 0, 0))
    px = sheet.load()
    idx = 0
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            offset = ((hi - 0xA1) * 0x5E + (lo - 0xA1)) * 32
            if offset + 32 > len(kf):
                continue
            glyph = kf[offset:offset + 32]
            try:
                ch = bytes([hi, lo]).decode("cp949")
            except Exception:
                continue
            hangul_map[ch] = glyph.hex()
            if idx < cols * rows:
                sr, sc = divmod(idx, cols)
                x0, y0 = sc * 16, sr * 16
                for y in range(16):
                    word = (glyph[y * 2] << 8) | glyph[y * 2 + 1]
                    for x in range(16):
                        if (word >> (15 - x)) & 1:
                            px[x0 + x, y0 + y] = (242, 224, 178, 255)
            idx += 1

    sheet.save(OUT_DIR / "fonts" / "kfont_15_hangul.png")
    # Save ASCII 8x16 + Hangul 16x16 bitmap lookup for Web Canvas renderer
    ascii_hex = [e16[i * 16:(i + 1) * 16].hex() for i in range(128)]
    (OUT_DIR / "fonts" / "font_bitmaps.json").write_text(
        json.dumps({"ascii_8x16": ascii_hex, "hangul_16x16": hangul_map}, ensure_ascii=False),
        encoding="utf-8",
    )
    return {
        "e16_chars": 128,
        "kfont_total_glyphs": len(kf) // 32,
        "hangul_glyphs": len(hangul_map),
        "files": ["fonts/font_e16.png", "fonts/font_em_e16.png", "fonts/kfont_15_hangul.png"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract SwordsMan 1993 DOS game assets")
    parser.add_argument("--reuse-wav", action="store_true", help="Reuse existing non-empty AdLib WAV files")
    args = parser.parse_args()

    print("Preparing output directories...", flush=True)
    ensure_dirs()

    print("1/7 Extracting palettes and UI screens...", flush=True)
    face_rgb, ui_meta = extract_ui_and_palettes()

    print("2/7 Extracting 150 character portraits (FACE.GRP)...", flush=True)
    faces_meta = extract_faces(face_rgb)

    print("3/7 Extracting cutscenes (GT, TIT, EM1~3, D9)...", flush=True)
    gt_tit_meta = extract_gt_and_tit()
    em_meta = extract_em_cutscenes()

    print("4/7 Extracting world maps, STK, REGION...", flush=True)
    world_meta = extract_world(face_rgb)

    print("5/7 Extracting EVENT.0~14 Korean dialogues and sprite sheets...", flush=True)
    events_meta = extract_events(face_rgb)

    print("6/7 Extracting 103 PCM VOC sound clips...", flush=True)
    voc_meta = extract_voc_audio()

    print("7/7 Converting & synthesizing 19 AdLib OPL2 tracks (WAV + MIDI) & Fonts...", flush=True)
    adlib_meta = extract_adlib_music(reuse_wav=args.reuse_wav)
    fonts_meta = extract_fonts()

    catalog = {
        "game": "SwordsMan (1993, Soft-World / 소오강호)",
        "ui": ui_meta,
        "faces": faces_meta,
        "cutscenes": {**gt_tit_meta, **em_meta},
        "world": world_meta,
        "events": events_meta,
        "audio": {
            "voc_count": len(voc_meta),
            "voc": voc_meta,
            "adlib_count": len(adlib_meta),
            "adlib": adlib_meta,
        },
        "fonts": fonts_meta,
    }
    (OUT_DIR / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"Extraction complete! Faces={faces_meta['count']}, "
        f"VOC={len(voc_meta)}, AdLib={len(adlib_meta)}, "
        f"Dialogues={events_meta['total_dialogues']}, Sprites={events_meta['total_sprites']}, "
        f"Hangul={fonts_meta['hangul_glyphs']}",
        flush=True,
    )


if __name__ == "__main__":
    main()
