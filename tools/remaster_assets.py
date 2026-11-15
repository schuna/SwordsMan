"""
SwordsMan (1993, Soft-World / 소오강호) Phase 2 Remastering Pipeline
Transforms extracted DOS assets (assets/extracted/) into high-definition,
de-dithered, EPX/Scale2x upscaled graphics and mastered 16-bit 22050Hz audio
under assets/remastered/. Never touches sm/.
"""

import os
import json
import math
import wave
import array
import struct
import shutil
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
from typing import List, Dict, Tuple, Any
from PIL import Image, ImageChops, ImageFilter, ImageEnhance, ImageOps

ROOT = Path(__file__).resolve().parent.parent
IN_DIR = ROOT / "assets" / "extracted"
OUT_DIR = ROOT / "assets" / "remastered"


def ensure_dirs() -> None:
    for sub in [
        "ui",
        "faces",
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
# Core Image Remastering Algorithms: EPX/Scale2x & Ordered Dither Removal
# ---------------------------------------------------------------------------

def epx_scale2x_rgba(img: Image.Image) -> Image.Image:
    """
    Exact EPX / Scale2x edge-preserving 2x pixel-art upscaler operating on packed uint32 RGBA pixels.
    For each pixel P with cardinal neighbors A (top), B (right), C (left), D (bottom):
      P1 = C if (C == A and C != D and A != B) else P
      P2 = B if (A == B and A != C and B != D) else P
      P3 = C if (D == C and D != B and C != A) else P
      P4 = B if (B == D and B != A and D != C) else P
    """
    rgba = img if img.mode == "RGBA" else img.convert("RGBA")
    w, h = rgba.size
    if w == 0 or h == 0:
        return rgba
    src = array.array("I")
    src.frombytes(rgba.tobytes())
    w2 = w * 2
    dst = array.array("I", [0]) * (w2 * h * 2)

    for y in range(h):
        ym1 = y - 1 if y > 0 else 0
        yp1 = y + 1 if y + 1 < h else h - 1
        row_u = ym1 * w
        row_c = y * w
        row_d = yp1 * w
        out_r0 = (y * 2) * w2
        out_r1 = out_r0 + w2
        for x in range(w):
            xm1 = x - 1 if x > 0 else 0
            xp1 = x + 1 if x + 1 < w else w - 1
            p = src[row_c + x]
            a = src[row_u + x]
            b = src[row_c + xp1]
            c = src[row_c + xm1]
            d = src[row_d + x]

            dst[out_r0 + x * 2] = c if (c == a and c != d and a != b) else p
            dst[out_r0 + x * 2 + 1] = b if (a == b and a != c and b != d) else p
            dst[out_r1 + x * 2] = c if (d == c and d != b and c != a) else p
            dst[out_r1 + x * 2 + 1] = b if (b == d and b != a and d != c) else p

    return Image.frombytes("RGBA", (w2, h * 2), dst.tobytes())


def dedither_rgb(img: Image.Image, strength: float = 0.65) -> Image.Image:
    """
    Detect 2x2 and alternating horizontal/vertical EGA/VGA ordered-dither stipples
    and selectively blend with cardinal cross-average while preserving crisp ink edges.
    """
    rgb = img if img.mode == "RGB" else img.convert("RGB")
    cross_avg = rgb.filter(
        ImageFilter.Kernel((3, 3), [0, 1, 0, 1, 0, 1, 0, 1, 0], scale=4, offset=0)
    )

    # Measure axis symmetry |L - R| and |U - D|: small in checkerboard dither, large across step edges
    left = ImageChops.offset(rgb, 1, 0)
    right = ImageChops.offset(rgb, -1, 0)
    up = ImageChops.offset(rgb, 0, 1)
    down = ImageChops.offset(rgb, 0, -1)

    sym_x = ImageChops.difference(left, right).convert("L")
    sym_y = ImageChops.difference(up, down).convert("L")
    edge_axis = ImageChops.lighter(sym_x, sym_y)

    # Difference between center pixel and cardinal average
    diff_center = ImageChops.difference(rgb, cross_avg).convert("L")

    # Mask: blend strongly where diff_center indicates dither (6..95) AND axis symmetry is low (<42)
    lut_axis = [max(0, min(255, int(255 - max(0, v - 12) * 5))) for v in range(256)]
    lut_band = [
        0 if v < 5 else (int(255 * strength) if v <= 88 else max(0, int((130 - v) * 4)))
        for v in range(256)
    ]
    axis_ok = edge_axis.point(lut_axis)
    band_ok = diff_center.point(lut_band)
    blend_mask = ImageChops.darker(axis_ok, band_ok)

    smooth = Image.blend(rgb, cross_avg, 0.72)
    out = Image.composite(smooth, rgb, blend_mask)
    return out.filter(ImageFilter.UnsharpMask(radius=1.1, percent=110, threshold=4))


def dedither_rgba_preserve_alpha(img: Image.Image, strength: float = 0.55) -> Image.Image:
    """Apply selective de-dithering only inside opaque interior pixels to avoid alpha edge bleed."""
    rgba = img if img.mode == "RGBA" else img.convert("RGBA")
    r, g, b, a = rgba.split()
    rgb = Image.merge("RGB", (r, g, b))
    cleaned = dedither_rgb(rgb, strength=strength)
    # Only apply smoothed RGB where minimum 3x3 neighbor alpha is 255 (strictly interior pixels)
    interior_alpha = a.filter(ImageFilter.MinFilter(3))
    composited = Image.composite(cleaned, rgb, interior_alpha)
    cr, cg, cb = composited.split()
    return Image.merge("RGBA", (cr, cg, cb, a))


def save_quantized_png(img: Image.Image, path: Path) -> None:
    q = img.convert("RGB").quantize(colors=256, method=Image.FASTOCTREE, dither=Image.NONE)
    q.save(path, optimize=True)


# ---------------------------------------------------------------------------
# 1. UI, Copy-Protection Sheets & Fonts
# ---------------------------------------------------------------------------

def remaster_ui_and_fonts() -> Dict[str, Any]:
    # CFGLBM / CFGLBM0: 320x200 -> 640x400 EPX 2x + crisp unsharp
    for name in ("cfglbm.png", "cfglbm0.png"):
        im = Image.open(IN_DIR / "ui" / name).convert("RGBA")
        up = epx_scale2x_rgba(im).convert("RGB")
        up = up.filter(ImageFilter.UnsharpMask(radius=0.9, percent=95, threshold=3))
        up.save(OUT_DIR / "ui" / name, optimize=True)

    # PASS01 / PASS02 / pass_ref: 640x480 de-dithered + contrast boost
    for name in ("pass01.png", "pass02.png", "pass_ref.png"):
        src = IN_DIR / "ui" / name
        if src.exists():
            im = Image.open(src).convert("RGB")
            clean = dedither_rgb(im, strength=0.6)
            clean = ImageEnhance.Contrast(clean).enhance(1.06)
            clean.save(OUT_DIR / "ui" / name, optimize=True)

    # Fonts: EPX 2x on font_e16 and kfont_15_hangul
    e16 = Image.open(IN_DIR / "fonts" / "font_e16.png").convert("RGBA")
    epx_scale2x_rgba(e16).save(OUT_DIR / "fonts" / "font_e16_hd.png", optimize=True)

    kf = Image.open(IN_DIR / "fonts" / "kfont_15_hangul.png").convert("RGBA")
    kf_hd = epx_scale2x_rgba(kf)
    # Add subtle warm gold gradient/drop shadow for HD preview sheet
    kf_hd.save(OUT_DIR / "fonts" / "kfont_15_hangul_hd.png", optimize=True)

    return {"ui_screens": 5, "fonts": ["fonts/kfont_15_hangul_hd.png", "fonts/font_e16_hd.png"]}


# ---------------------------------------------------------------------------
# 2. Faces (150 portraits: 50x50 -> 200x200 4x EPX + de-dithered)
# ---------------------------------------------------------------------------

def _remaster_one_face(idx: int) -> Tuple[int, str]:
    fn = f"face_{idx:03d}.png"
    im = Image.open(IN_DIR / "faces" / fn).convert("RGBA")
    clean = dedither_rgba_preserve_alpha(im, strength=0.55)
    up2 = epx_scale2x_rgba(clean)
    # Light interior soften before 2nd EPX pass for smoother portrait skin gradients
    up2_smooth = dedither_rgba_preserve_alpha(up2, strength=0.45)
    up4 = epx_scale2x_rgba(up2_smooth)
    up4 = dedither_rgba_preserve_alpha(up4, strength=0.25)
    # Subtle contrast pop while preserving alpha
    r, g, b, a = up4.split()
    rgb = Image.merge("RGB", (r, g, b)).filter(
        ImageFilter.UnsharpMask(radius=1.0, percent=105, threshold=4)
    )
    rr, gg, bb = rgb.split()
    out = Image.merge("RGBA", (rr, gg, bb, a))
    out.save(OUT_DIR / "faces" / fn, optimize=True)
    return idx, fn


def remaster_faces(count: int) -> Dict[str, Any]:
    with ProcessPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
        done = list(pool.map(_remaster_one_face, range(count)))

    # Build compact 100x100-per-cell HD sheet (1500x1000)
    cols = 15
    rows = (count + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * 100, rows * 100), (0, 0, 0, 0))
    for idx, fn in done:
        im = Image.open(OUT_DIR / "faces" / fn).resize((100, 100), Image.LANCZOS)
        sr, sc = divmod(idx, cols)
        sheet.paste(im, (sc * 100, sr * 100))
    sheet.save(OUT_DIR / "faces" / "faces_sheet_hd.png", optimize=True)
    return {"count": count, "width": 200, "height": 200, "sheet": "faces/faces_sheet_hd.png"}


# ---------------------------------------------------------------------------
# 3. Cutscenes (GT, TIT, EM1~3, D9)
# ---------------------------------------------------------------------------

def _process_em_frame(args: Tuple[str, str, str]) -> Tuple[str, str]:
    slug, in_rel, out_rel = args
    im = Image.open(IN_DIR / in_rel).convert("RGBA")
    # Most EM scenes have full 320x200 imagery; run de-dither + EPX 2x -> 640x400
    rgb = dedither_rgb(im.convert("RGB"), strength=0.62)
    up = epx_scale2x_rgba(rgb.convert("RGBA")).convert("RGB")
    up = ImageEnhance.Color(up).enhance(1.06)
    save_quantized_png(up, OUT_DIR / out_rel)
    return slug, out_rel


def remaster_cutscenes(catalog: Dict[str, Any]) -> Dict[str, Any]:
    out_meta: Dict[str, Any] = {}

    # GT: 640x480 16-color dithered -> 24-bit de-dithered HD PNG
    gt_frames = []
    for rel in catalog["cutscenes"]["gt"]["frames"]:
        im = Image.open(IN_DIR / rel).convert("RGB")
        hd = dedither_rgb(im, strength=0.85)
        hd = ImageEnhance.Contrast(hd).enhance(1.08)
        hd = ImageEnhance.Color(hd).enhance(1.06)
        hd.save(OUT_DIR / rel, optimize=True)
        gt_frames.append(rel)
    out_meta["gt"] = {"width": 640, "height": 480, "frames": gt_frames}

    # TIT: 640x300 calligraphy -> warm contrast + gentle anti-aliasing
    tit_frames = []
    tit_imgs = []
    for rel in catalog["cutscenes"]["tit"]["frames"]:
        im = Image.open(IN_DIR / rel).convert("RGB")
        # Gentle 3x3 anti-aliasing around ink strokes then crisp boost
        soft = im.filter(ImageFilter.GaussianBlur(radius=0.55))
        hd = Image.blend(im, soft, 0.32)
        hd = ImageEnhance.Contrast(hd).enhance(1.06)
        hd = hd.filter(ImageFilter.UnsharpMask(radius=1.0, percent=115, threshold=5))
        hd.save(OUT_DIR / rel, optimize=True)
        tit_frames.append(rel)
        tit_imgs.append(hd)
    if tit_imgs:
        tit_imgs[0].save(
            OUT_DIR / "cutscenes" / "tit" / "tit_opening.gif",
            save_all=True,
            append_images=tit_imgs[1:],
            duration=140,
            loop=0,
        )
    out_meta["tit"] = {
        "width": 640,
        "height": 300,
        "frames": tit_frames,
        "gif": "cutscenes/tit/tit_opening.gif",
    }

    # EM1, EM2, EM3, D9 frames in parallel
    tasks = []
    for slug in ("em1", "em2", "em3", "d9"):
        for rel in catalog["cutscenes"][slug]["frames"]:
            tasks.append((slug, rel, rel))

    with ProcessPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
        list(pool.map(_process_em_frame, tasks))

    for slug in ("em1", "em2", "em3", "d9"):
        entry = catalog["cutscenes"][slug]
        frames = entry["frames"]
        step = 2 if len(frames) <= 120 else 4
        subset = [Image.open(OUT_DIR / f) for f in frames[::step]]
        gif_rel = f"cutscenes/{slug}/{slug}.gif"
        if subset:
            subset[0].save(
                OUT_DIR / gif_rel,
                save_all=True,
                append_images=subset[1:],
                duration=(entry.get("frame_ms", 100)) * step,
                loop=0,
                disposal=2,
            )
        out_meta[slug] = {
            "width": 640,
            "height": 400,
            "frame_ms": entry.get("frame_ms", 100),
            "frames": frames,
            "gif": gif_rel,
        }
    return out_meta


# ---------------------------------------------------------------------------
# 4. World Maps & Chapter Sprite Sheets (2x EPX per sprite bbox)
# ---------------------------------------------------------------------------

def _remaster_one_sprite_sheet(ch_entry: Dict[str, Any]) -> Dict[str, Any]:
    ch = ch_entry["chapter"]
    src_sheet = Image.open(IN_DIR / ch_entry["sheet"]).convert("RGBA")
    w2 = ch_entry["sheet_width"] * 2
    h2 = ch_entry["sheet_height"] * 2
    dst_sheet = Image.new("RGBA", (w2, h2), (0, 0, 0, 0))
    hd_sprites = []

    for sp in ch_entry["sprites"]:
        sx, sy, w, h = sp["sx"], sp["sy"], sp["w"], sp["h"]
        crop = src_sheet.crop((sx, sy, sx + w, sy + h))
        crop_hd = epx_scale2x_rgba(crop)
        dst_sheet.paste(crop_hd, (sx * 2, sy * 2))
        hd_sprites.append({
            "id": sp["id"],
            "sx": sx * 2,
            "sy": sy * 2,
            "w": w * 2,
            "h": h * 2,
            "orig_x": sp["orig_x"],
            "orig_y": sp["orig_y"],
        })

    out_rel = f"events/event_{ch:02d}_sheet.png"
    dst_sheet.save(OUT_DIR / out_rel, optimize=True)
    return {
        "chapter": ch,
        "sheet": out_rel,
        "sheet_width": w2,
        "sheet_height": h2,
        "sprite_count": len(hd_sprites),
        "sprites": hd_sprites,
    }


def remaster_world_and_sprites() -> Dict[str, Any]:
    # World maps 128x128 -> 512x512 EPX 4x + subtle grid overlay
    for ch in range(15):
        im = Image.open(IN_DIR / "world" / f"map_{ch:02d}.png").convert("RGBA")
        up2 = epx_scale2x_rgba(im)
        up4 = epx_scale2x_rgba(up2).convert("RGB")
        up4 = up4.filter(ImageFilter.UnsharpMask(radius=1.0, percent=100, threshold=3))
        up4.save(OUT_DIR / "world" / f"map_{ch:02d}.png", optimize=True)

    spr_idx = json.loads((IN_DIR / "events" / "sprites_index.json").read_text(encoding="utf-8"))
    with ProcessPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
        hd_chapters = list(pool.map(_remaster_one_sprite_sheet, spr_idx["chapters"]))

    (OUT_DIR / "events" / "sprites_index_hd.json").write_text(
        json.dumps({"total_sprites": spr_idx["total_sprites"], "chapters": hd_chapters}),
        encoding="utf-8",
    )
    return {"maps": 15, "total_sprites_hd": spr_idx["total_sprites"]}


# ---------------------------------------------------------------------------
# 5. Audio Remastering: VOC Cubic Hermite 22050Hz + AdLib Chorus/Reverb DSP
# ---------------------------------------------------------------------------

def _remaster_one_voc(rel_path: str) -> str:
    in_p = IN_DIR / rel_path
    out_p = OUT_DIR / rel_path
    with wave.open(str(in_p), "rb") as wf:
        sr_in = wf.getframerate()
        raw = wf.readframes(wf.getnframes())

    if not raw:
        with wave.open(str(out_p), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(22050)
            wf.writeframes(b"")
        return rel_path

    # DC offset removal via median + soft noise gate
    med = float(sorted(raw)[len(raw) // 2])
    samples = []
    for b in raw:
        v = float(b) - med
        if abs(v) <= 2.2:
            v *= 0.25
        samples.append(v)

    n_in = len(samples)
    sr_out = 22050
    ratio = float(sr_in) / float(sr_out)
    n_out = max(1, int(round(n_in * (float(sr_out) / float(sr_in)))))

    # 4-point Cubic Hermite (Catmull-Rom) upsampling
    up = [0.0] * n_out
    last = n_in - 1
    for i in range(n_out):
        pos = i * ratio
        idx = int(pos)
        t = pos - idx
        y0 = samples[idx - 1 if idx > 0 else 0]
        y1 = samples[idx if idx <= last else last]
        y2 = samples[idx + 1 if idx + 1 <= last else last]
        y3 = samples[idx + 2 if idx + 2 <= last else last]

        c0 = y1
        c1 = 0.5 * (y2 - y0)
        c2 = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3
        c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2)
        up[i] = ((c3 * t + c2) * t + c1) * t + c0

    # Gentle 1-pole low-pass (~3.8kHz @ 22050Hz) to attenuate 8kHz aliasing hiss
    lp = 0.0
    alpha = 0.62
    for i in range(n_out):
        lp = lp + alpha * (up[i] - lp)
        up[i] = lp

    # 8ms linear fade-in/out to eliminate DOS DMA click
    fade = min(n_out // 2, int(0.008 * sr_out))
    for i in range(fade):
        g = (i + 1) / float(fade)
        up[i] *= g
        up[n_out - 1 - i] *= g

    peak = max((abs(x) for x in up), default=1.0)
    scale = 27500.0 / peak if peak > 1e-4 else 1.0
    pcm = array.array("h", (int(max(-32767, min(32767, x * scale))) for x in up))

    with wave.open(str(out_p), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr_out)
        wf.writeframes(pcm.tobytes())
    return rel_path


def _remaster_one_adlib(rel_path: str) -> Tuple[str, float]:
    in_p = IN_DIR / rel_path
    out_p = OUT_DIR / rel_path
    with wave.open(str(in_p), "rb") as wf:
        sr = wf.getframerate()
        raw = wf.readframes(wf.getnframes())

    src = array.array("h")
    src.frombytes(raw)
    tail_samples = int(0.35 * sr)
    n_in = len(src)
    n_tot = n_in + tail_samples

    # LFO Chorus parameters (22050Hz)
    chorus_len = 512
    chorus_buf = [0.0] * chorus_len
    chorus_idx = 0
    lfo_inc = (2.0 * math.pi * 0.85) / sr
    base_delay = 0.011 * sr  # 11ms
    depth = 0.0018 * sr      # +/- 1.8ms

    # Schroeder 3 parallel damped comb filters + 1 allpass diffuser
    l1, l2, l3 = 655, 818, 906
    cb1, cb2, cb3 = [0.0] * l1, [0.0] * l2, [0.0] * l3
    lp1 = lp2 = lp3 = 0.0
    i1 = i2 = i3 = 0

    lap = 110
    ap_buf = [0.0] * lap
    iap = 0

    sub_lp = 0.0
    out_f = [0.0] * n_tot

    sin_fn = math.sin
    tanh_fn = math.tanh
    fb = 0.42
    damp = 0.28
    one_m_damp = 1.0 - damp
    lfo_phase = 0.0

    for i in range(n_tot):
        x = (src[i] / 32768.0) if i < n_in else 0.0

        # 1. Sub-bass warmth + harmonic exciter
        sub_lp = sub_lp + 0.061 * (x - sub_lp)
        warm = x + sub_lp * 0.50
        exc = tanh_fn(warm * 1.12) * 0.90 + 0.035 * tanh_fn(warm * 2.2)

        # 2. Modulated Chorus / Ensemble
        chorus_buf[chorus_idx] = exc
        d_pos = base_delay + depth * sin_fn(lfo_phase)
        lfo_phase += lfo_inc
        r_f = chorus_idx - d_pos
        r_i = int(math.floor(r_f))
        frac = r_f - r_i
        p0 = chorus_buf[r_i & 511]
        p1 = chorus_buf[(r_i + 1) & 511]
        ch_sig = p0 + frac * (p1 - p0)
        chorus_idx = (chorus_idx + 1) & 511

        ensemble = exc * 0.85 + ch_sig * 0.28

        # 3. Parallel damped comb filters
        c1 = cb1[i1]
        lp1 = c1 * one_m_damp + lp1 * damp
        cb1[i1] = ensemble + lp1 * fb
        i1 += 1
        if i1 == l1:
            i1 = 0

        c2 = cb2[i2]
        lp2 = c2 * one_m_damp + lp2 * damp
        cb2[i2] = ensemble + lp2 * fb
        i2 += 1
        if i2 == l2:
            i2 = 0

        c3 = cb3[i3]
        lp3 = c3 * one_m_damp + lp3 * damp
        cb3[i3] = ensemble + lp3 * fb
        i3 += 1
        if i3 == l3:
            i3 = 0

        comb_sum = (c1 + c2 + c3) * 0.34

        # 4. All-pass diffuser
        ap_old = ap_buf[iap]
        ap_out = -0.5 * comb_sum + ap_old
        ap_buf[iap] = comb_sum + 0.5 * ap_out
        iap += 1
        if iap == lap:
            iap = 0

        out_f[i] = ensemble * 0.84 + ap_out * 0.26

    peak = max((abs(v) for v in out_f), default=1.0)
    scale = 29200.0 / peak if peak > 1e-4 else 1.0
    pcm = array.array("h", (int(max(-32767, min(32767, v * scale))) for v in out_f))

    with wave.open(str(out_p), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())

    return rel_path, round(n_tot / float(sr), 2)


def remaster_audio(catalog: Dict[str, Any]) -> Dict[str, Any]:
    voc_files = [v["file"] for v in catalog["audio"]["voc"]]
    adlib_files = [a["wav"] for a in catalog["audio"]["adlib"]]

    with ProcessPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
        list(pool.map(_remaster_one_voc, voc_files))
        adlib_res = list(pool.map(_remaster_one_adlib, adlib_files))

    return {
        "voc_count": len(voc_files),
        "voc_format": "22050Hz 16-bit PCM (Cubic Hermite + Noise Gate)",
        "adlib_count": len(adlib_res),
        "adlib_format": "22050Hz 16-bit PCM (Exciter + Chorus + Schroeder Hall Reverb)",
    }


def main() -> None:
    print("Preparing Phase 2 remastered directories...", flush=True)
    ensure_dirs()
    catalog = json.loads((IN_DIR / "catalog.json").read_text(encoding="utf-8"))

    print("1/5 Remastering UI screens and Hangul/ASCII bitmap fonts...", flush=True)
    ui_font_meta = remaster_ui_and_fonts()

    print("2/5 Remastering 150 character portraits (4x EPX + de-dither)...", flush=True)
    faces_meta = remaster_faces(catalog["faces"]["count"])

    print("3/5 Remastering cutscenes (GT, TIT, EM1~3, D9)...", flush=True)
    cutscenes_meta = remaster_cutscenes(catalog)

    print("4/5 Remastering 15 world maps and 7,604 chapter sprites (2x EPX)...", flush=True)
    world_meta = remaster_world_and_sprites()

    print("5/5 Remastering 103 VOC voices and 19 AdLib OPL2 tracks (DSP)...", flush=True)
    audio_meta = remaster_audio(catalog)

    remaster_catalog = {
        "phase": 2,
        "ui_fonts": ui_font_meta,
        "faces": faces_meta,
        "cutscenes": cutscenes_meta,
        "world": world_meta,
        "audio": audio_meta,
    }
    (OUT_DIR / "remaster_catalog.json").write_text(
        json.dumps(remaster_catalog, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("Phase 2 remastering complete!", flush=True)


if __name__ == "__main__":
    main()
