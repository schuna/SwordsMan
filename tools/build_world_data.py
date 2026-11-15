"""
Phase 3 Data Pipeline: Build World, Chapter, Entity, Item, and Event Bytecode JSON.

Reads original read-only assets from sm/ (MAP.0~14, STK.0~14, EVENT.0~14) and cross-references
extracted sprite sheets in assets/extracted/events/sprites_index.json to produce:
  assets/extracted/world/chapters_data.json
"""

from __future__ import annotations

import base64
import json
import struct
import sys
from pathlib import Path
from typing import Any

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from extract_assets import OUT_DIR, SM_DIR, decompress_lzss  # noqa: E402

CHAPTER_TITLES: dict[int, str] = {
    0: "CH0 화산파 · 출산 전야",
    1: "CH1 형산성 · 유정풍 퇴임식",
    2: "CH2 화산 사과암 · 풍청양과 전백광",
    3: "CH3 (미사용 슬롯)",
    4: "CH4 복위표국 외곽 숲",
    5: "CH5 약왕묘 · 벽사검보 쟁탈",
    6: "CH6 복위표국 · 임영영의 구출",
    7: "CH7 녹죽항 · 매화산장의 전갈",
    8: "CH8 숭산 · 4수비와 포로 구출",
    9: "CH9 (미사용 슬롯)",
    10: "CH10 (미사용 슬롯)",
    11: "CH11 매화산장 1층 · 사우 대결",
    12: "CH12 매화산장 지하 · 임아행 구출",
    13: "CH13 소림사 · 임아행과 악불군",
    14: "CH14 흑목애 · 동방불패 최종 결전",
}

FALLBACK_SPAWNS: dict[int, tuple[float, float]] = {
    0: (72.25, 72.25),
    1: (9.0, 84.0),
    2: (11.0, 59.0),
    3: (64.0, 64.0),
    4: (88.0, 10.0),
    5: (88.0, 89.0),
    6: (105.0, 21.0),
    7: (25.0, 89.0),
    8: (52.0, 106.0),
    9: (64.0, 64.0),
    10: (64.0, 64.0),
    11: (19.0, 114.0),
    12: (26.0, 47.0),
    13: (73.0, 47.0),
    14: (74.0, 42.0),
}

SPEAKER_NAMES: dict[int, str] = {
    4: "영호충",
    5: "임평지",
    8: "육대유",
    10: "매화산장 고수",
    13: "곡양",
    14: "유정풍",
    15: "화산 제자",
    20: "숭산파 제자",
    24: "마교 추격자",
    26: "황종공",
    32: "청성파 제자",
    35: "청성파 제자",
    66: "악영산",
    77: "전백광 / 봉불평",
    80: "영부인 (영중칙)",
    81: "악영산",
    82: "의림",
    87: "악불군",
    88: "풍청양",
    90: "도곡육선",
    92: "임진남",
    93: "비빈",
    95: "청성파 협객",
    100: "곡비연",
    101: "유정풍",
    105: "임영영",
    106: "향문천",
    110: "임아행",
    115: "일월신교 고수",
    127: "단청생",
}

PHASE_KOREAN_NAMES: dict[str, str] = {
    "Player": "영호충",
    "FongBuPi": "봉불평",
    "tianBou": "전백광",
    "TuBiWon": "단청생 / 황종공",
    "UeBuChun": "동방불패",
    "FeiDaw": "비도 무사",
    "Fei Hamer": "철퇴 무사",
    "HoDoKen": "권법 고수",
    "thustman": "장창 무사",
    "slashman": "검객",
}


def decode_cp949(raw: bytes) -> str:
    return raw.split(b"\x00", 1)[0].decode("cp949", "replace")


def read_named_words(entry: bytes) -> tuple[str, tuple[int, ...]]:
    if len(entry) < 2:
        return "", ()
    nlen = struct.unpack_from("<H", entry, 0)[0]
    nlen = min(nlen, len(entry))
    name = decode_cp949(entry[2:nlen]).strip()
    word_count = (len(entry) - nlen) // 2
    words = struct.unpack_from(f"<{word_count}H", entry, nlen) if word_count > 0 else ()
    return name, words


def decode_comd_bytecode(
    comd_idx: int,
    name: str,
    bc: bytes,
) -> dict[str, Any]:
    steps: list[dict[str, Any]] = []
    cur_face: int | None = None
    p = 6 if len(bc) >= 6 else 0

    while p < len(bc) - 1:
        op = struct.unpack_from("<H", bc, p)[0]

        if op == 0x8025 and p + 4 <= len(bc):
            face_id = struct.unpack_from("<H", bc, p + 2)[0]
            if face_id < 150:
                cur_face = face_id
                steps.append(
                    {
                        "op": "face",
                        "face_id": face_id,
                        "speaker": SPEAKER_NAMES.get(face_id, f"인물 #{face_id}"),
                    }
                )
            p += 4
            continue

        if op == 0x8020 and p + 3 <= len(bc):
            q = p + 2
            while q < len(bc) and bc[q] != 0 and bc[q] < 0x20:
                q += 1
            z = bc.find(b"\x00", q)
            if z == -1:
                z = len(bc)
            raw_text = bc[q:z].decode("cp949", "replace")
            cleaned = "\n".join(
                " ".join(line.split())
                for line in raw_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
            ).strip()
            if cleaned:
                steps.append(
                    {
                        "op": "say",
                        "face_id": cur_face,
                        "speaker": (
                            SPEAKER_NAMES.get(cur_face, f"인물 #{cur_face}")
                            if cur_face is not None
                            else "시스템"
                        ),
                        "text": cleaned,
                    }
                )
            p = z + 1
            continue

        if op == 0x8028 and p + 11 <= len(bc):
            target_ch, flg, tx, ty, tdir = struct.unpack_from("<HBHHH", bc, p + 2)
            if target_ch == 0xFFFF or target_ch < 15:
                steps.append(
                    {
                        "op": "teleport",
                        "target_chapter": None if target_ch == 0xFFFF else int(target_ch),
                        "flag": int(flg),
                        "x": int(tx),
                        "y": int(ty),
                        "dir": int((tdir >> 8) & 0xFF if tdir > 255 else tdir),
                    }
                )
                p += 11
                continue

        if op == 0x8036 and p + 8 <= len(bc):
            obj_slot, flags, new_val = struct.unpack_from("<HHH", bc, p + 2)
            steps.append(
                {
                    "op": "set_obj",
                    "obj_slot": None if obj_slot == 0xFFFF else int(obj_slot),
                    "flags": int(flags),
                    "value": int(new_val),
                }
            )
            p += 8
            continue

        if op == 0x8062 and p + 6 <= len(bc):
            slot, item_id = struct.unpack_from("<HH", bc, p + 2)
            if item_id != 0xFFFF and item_id != 0:
                steps.append(
                    {
                        "op": "give_item",
                        "slot": int(slot),
                        "item_id": int(item_id),
                    }
                )
            p += 6
            continue

        p += 1

    return {
        "id": comd_idx,
        "name": name,
        "byte_len": len(bc),
        "steps": steps,
    }


def load_sprite_sets() -> dict[int, dict[str, Any]]:
    idx_path = OUT_DIR / "events" / "sprites_index.json"
    data = json.loads(idx_path.read_text(encoding="utf-8"))
    by_ch: dict[int, dict[str, Any]] = {}
    for ch_entry in data.get("chapters", []):
        ch = int(ch_entry["chapter"])
        ids = {int(sp["id"]): sp for sp in ch_entry.get("sprites", [])}
        by_ch[ch] = {
            "sheet": ch_entry.get("sheet", f"events/event_{ch:02d}_sheet.png"),
            "ids": ids,
        }
    return by_ch


def build_chapter(ch: int, sprite_info: dict[str, Any]) -> dict[str, Any]:
    ev_raw = decompress_lzss((SM_DIR / "EVENT" / f"EVENT.{ch}").read_bytes())
    stk_raw = decompress_lzss((SM_DIR / "STK" / f"STK.{ch}").read_bytes())
    map_raw = decompress_lzss((SM_DIR / "MAP" / f"MAP.{ch}").read_bytes())

    hdr = struct.unpack_from("<16H", ev_raw, 0)
    cnt = hdr[0]
    active = cnt > 100
    first_spr = hdr[15]
    valid_ids: dict[int, dict[str, Any]] = sprite_info.get("ids", {})

    if not active:
        sx, sy = FALLBACK_SPAWNS.get(ch, (64.0, 64.0))
        return {
            "chapter": ch,
            "active": False,
            "title": CHAPTER_TITLES.get(ch, f"CH{ch}"),
            "sheet": sprite_info.get("sheet", f"events/event_{ch:02d}_sheet.png"),
            "first_spr": first_spr,
            "spawn": {"x": sx, "y": sy, "hp": 200, "max_hp": 200, "mp": 200, "dir": 2},
            "map_w": 128,
            "map_h": 128,
            "map_b64": "",
            "ter": [],
            "phases": [],
            "items": [],
            "comds": [],
            "chars": [],
            "objs": [],
        }

    offs = struct.unpack_from(f"<{cnt + 1}I", ev_raw, 32)

    def get_entry(i: int) -> bytes:
        return ev_raw[offs[i] : offs[i + 1]]

    # 1. PHASE table (hdr[2] .. hdr[3]-1)
    phases: list[dict[str, Any]] = []
    for p_idx in range(hdr[2], hdr[3]):
        pname, words = read_named_words(get_entry(p_idx))
        stride = int(words[0]) if words else 32
        abs_frames: list[int] = []
        for w in words[1:]:
            if w > 4:
                abs_id = first_spr + int(w)
                abs_frames.append(abs_id if abs_id in valid_ids else 0)
            else:
                abs_frames.append(0)
        phases.append(
            {
                "id": p_idx - hdr[2],
                "name": pname,
                "label": PHASE_KOREAN_NAMES.get(pname, pname),
                "stride": stride,
                "frames": abs_frames,
            }
        )

    # 2. TER terrain definitions (hdr[5] .. hdr[6]-1)
    ter_list: list[dict[str, Any]] = []
    for t_idx in range(hdr[5], hdr[6]):
        tname, words = read_named_words(get_entry(t_idx))
        spr_rel = int(words[9]) if len(words) > 9 else 0
        abs_id = first_spr + spr_rel
        sp = valid_ids.get(abs_id)
        ter_list.append(
            {
                "id": t_idx - hdr[5],
                "name": tname,
                "spr_rel": spr_rel,
                "spr_id": abs_id if sp else None,
                "blocking": int(words[10]) if len(words) > 10 else 0,
                "damage": int(words[1]) if len(words) > 1 else 0,
                "tall": bool(sp and sp.get("orig_y", 40) < 36),
            }
        )

    # 3. ITEM table (hdr[11] .. hdr[12]-1)
    items: list[dict[str, Any]] = []
    for it_idx in range(hdr[11], hdr[12]):
        iname, words = read_named_words(get_entry(it_idx))
        items.append(
            {
                "id": it_idx - hdr[11],
                "name": iname,
                "icon_spr": int(words[0]) if len(words) > 0 else 0,
                "effect_id": int(words[6]) if len(words) > 6 else 0,
            }
        )

    # 4. COMD scripts (hdr[6] .. hdr[7]-1)
    comds: list[dict[str, Any]] = []
    dead_comd_id: int | None = None
    for c_idx in range(hdr[6], hdr[7]):
        raw_entry = get_entry(c_idx)
        nlen = struct.unpack_from("<H", raw_entry, 0)[0]
        cname = decode_cp949(raw_entry[2:nlen]).strip()
        local_id = c_idx - hdr[6]
        decoded = decode_comd_bytecode(local_id, cname, raw_entry[nlen:])
        comds.append(decoded)
        if "DEAD" in cname.upper():
            dead_comd_id = local_id

    # 5. STK Character slots (0..31 at offset 0, 64B each)
    p_words = struct.unpack_from("<32H", stk_raw, 0)
    if p_words[1] >= 256 and p_words[2] >= 256 and p_words[14] >= 100:
        sx = round(p_words[1] / 256.0, 2)
        sy = round(p_words[2] / 256.0, 2)
        shp = int(p_words[13]) or 200
        smax = max(shp, int(p_words[14]) or 200)
        smp = int(p_words[16]) or 200
    else:
        sx, sy = FALLBACK_SPAWNS.get(ch, (64.0, 64.0))
        shp, smax, smp = 1000, 1000, 1000

    spawn = {
        "x": sx,
        "y": sy,
        "hp": shp,
        "max_hp": smax,
        "mp": smp,
        "dir": 2,
    }

    chars: list[dict[str, Any]] = []
    for s in range(1, 32):
        w = struct.unpack_from("<32H", stk_raw, s * 64)
        if w[2] != w[1] + 1 and (w[1] > 0 or w[2] > 0) and 1 <= w[14] <= 20000:
            phase_idx = (w[6] >> 8) & 0xFF
            if phase_idx >= len(phases):
                phase_idx = 0
            hp_cur = int(w[13]) if w[13] > 0 else int(w[14])
            hp_max = max(hp_cur, int(w[14]))
            pname = phases[phase_idx]["label"] if phase_idx < len(phases) else f"NPC #{s}"
            is_boss = s == 1
            chars.append(
                {
                    "slot": s,
                    "x": round(w[1] / 256.0, 2),
                    "y": round(w[2] / 256.0, 2),
                    "hp": hp_cur,
                    "max_hp": hp_max,
                    "mp": int(w[16]),
                    "phase_idx": phase_idx,
                    "dir": int(w[6] & 0x03),
                    "attack": max(15, int(w[22]) * 8),
                    "name": f"{pname} (보스)" if is_boss else pname,
                    "is_boss": is_boss,
                    "defeat_comd": dead_comd_id if is_boss else None,
                }
            )

    # 6. STK Object/Chest/NPC/Trigger slots (0..63 at offset 2048, 32B each)
    objs: list[dict[str, Any]] = []
    for s in range(64):
        w = struct.unpack_from("<16H", stk_raw, 2048 + s * 32)
        if w[2] != w[1] + 1 and (w[1] > 0 or w[2] > 0):
            raw_spr = int(w[0])
            abs_spr: int | None = None
            if 0 < raw_spr < 650:
                candidate = first_spr + raw_spr
                if candidate in valid_ids:
                    abs_spr = candidate

            raw_comd = int(w[6])
            comd_id = raw_comd & 0xFF if raw_comd >= len(comds) else raw_comd
            phase_hint = (raw_comd >> 8) & 0xFF if raw_comd >= len(comds) else 0

            ox = round(w[1] / 256.0, 2)
            oy = round(w[2] / 256.0, 2)
            cname = comds[comd_id]["name"] if comd_id < len(comds) else ""

            if cname == "CHEST" or raw_spr in (364, 378, 379):
                kind = "chest"
            elif raw_spr == 16384 or "tele" in cname.lower() or (
                comd_id < len(comds)
                and any(st["op"] == "teleport" for st in comds[comd_id]["steps"])
                and abs_spr is None
            ):
                kind = "portal"
            elif abs_spr is not None:
                kind = "npc"
            else:
                kind = "trigger"

            # Filter out placeholder dummy chests at (10, 10) with spr=65535
            if raw_spr == 65535 and ox <= 12.0 and oy <= 12.0:
                continue

            item_id = int(w[14])
            item_qty = int(w[15])
            label = cname or kind.upper()
            if kind == "chest" and 0 <= item_id < len(items):
                label = f"보물상자 ({items[item_id]['name']} ×{max(1, item_qty)})"
            elif kind == "npc" and comd_id < len(comds):
                say_step = next(
                    (st for st in comds[comd_id]["steps"] if st["op"] == "say"),
                    None,
                )
                if say_step:
                    label = f"{say_step['speaker']} ({cname})"
            elif comd_id < len(comds):
                say_step = next(
                    (st for st in comds[comd_id]["steps"] if st["op"] == "say"),
                    None,
                )
                if say_step:
                    label = f"{say_step['speaker']} · {cname}"

            objs.append(
                {
                    "slot": s,
                    "x": ox,
                    "y": oy,
                    "raw_spr": raw_spr,
                    "spr_id": abs_spr,
                    "flags": int(w[4]),
                    "mode": int(w[5]),
                    "comd_id": comd_id,
                    "phase_hint": phase_hint,
                    "item_id": item_id,
                    "item_qty": max(1, item_qty) if kind == "chest" else item_qty,
                    "kind": kind,
                    "label": label,
                }
            )

    return {
        "chapter": ch,
        "active": True,
        "title": CHAPTER_TITLES.get(ch, f"CH{ch}"),
        "sheet": sprite_info.get("sheet", f"events/event_{ch:02d}_sheet.png"),
        "first_spr": first_spr,
        "spawn": spawn,
        "map_w": 128,
        "map_h": 128,
        "map_b64": base64.b64encode(map_raw).decode("ascii"),
        "ter": ter_list,
        "phases": phases,
        "items": items,
        "comds": comds,
        "chars": chars,
        "objs": objs,
    }


def main() -> None:
    sprite_sets = load_sprite_sets()
    chapters: list[dict[str, Any]] = []

    total_say = 0
    total_objs = 0
    total_chars = 0

    for ch in range(15):
        ch_data = build_chapter(ch, sprite_sets.get(ch, {}))
        chapters.append(ch_data)
        say_cnt = sum(
            1
            for cmd in ch_data["comds"]
            for st in cmd["steps"]
            if st["op"] == "say"
        )
        total_say += say_cnt
        total_objs += len(ch_data["objs"])
        total_chars += len(ch_data["chars"])
        if ch_data["active"]:
            print(
                f"CH{ch:02d} {ch_data['title']:28s} | TER={len(ch_data['ter']):2d} "
                f"PHASE={len(ch_data['phases']):2d} CHARS={len(ch_data['chars']):2d} "
                f"OBJS={len(ch_data['objs']):2d} COMD={len(ch_data['comds']):2d} SAY={say_cnt:2d}"
            )
        else:
            print(f"CH{ch:02d} (inactive)")

    payload = {
        "version": 1,
        "active_chapters": [c["chapter"] for c in chapters if c["active"]],
        "speaker_names": {str(k): v for k, v in SPEAKER_NAMES.items()},
        "intro": {
            "gt_screens": ["cutscenes/gt/gt_scene_0.png", "cutscenes/gt/gt_scene_1.png"],
            "tit_frames": [f"cutscenes/tit/tit_frame_{i:02d}.png" for i in range(28)],
            "tit_music": "audio/adlib/tit_theme.wav",
        },
        "chapters": chapters,
    }

    out_path = OUT_DIR / "world" / "chapters_data.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    size_kb = out_path.stat().st_size / 1024.0
    print(
        f"\nSaved {out_path} ({size_kb:.1f} KB) | active={len(payload['active_chapters'])} "
        f"| chars={total_chars} objs={total_objs} say_lines={total_say}"
    )


if __name__ == "__main__":
    main()
