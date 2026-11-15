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
    "LinPinZi": "임평지",
    "HeiBaiZi": "흑백자",
    "ZuoLernCh": "좌냉선",
    "FeiDaw": "비도 무사",
    "Fei Hamer": "철퇴 무사",
    "HoDoKen": "권법 고수",
    "thustman": "장창 무사",
    "slashman": "검객",
}

MARTIAL_ARTS: list[dict[str, Any]] = [
    {
        "id": "huashan",
        "key": "1",
        "name": "화산검법",
        "mp_cost": 0,
        "damage": 55,
        "range": 3.2,
        "proj": False,
        "aoe": False,
        "heal_hp": 0,
        "heal_mp": 0,
        "color": "#ffe082",
        "desc": "화산파 기본 검술 (근접 베기, 내공 소모 없음)",
    },
    {
        "id": "dugu",
        "key": "2",
        "name": "독고구검",
        "mp_cost": 15,
        "damage": 95,
        "range": 7.5,
        "proj": True,
        "aoe": False,
        "heal_hp": 0,
        "heal_mp": 0,
        "color": "#4dd0e1",
        "desc": "풍청양 전수 무상검기 (관통 검기 투사체 발사)",
    },
    {
        "id": "bixie",
        "key": "3",
        "name": "벽사검법",
        "mp_cost": 22,
        "damage": 135,
        "range": 6.5,
        "proj": True,
        "aoe": False,
        "heal_hp": 0,
        "heal_mp": 0,
        "color": "#ff6e80",
        "desc": "규화보전 계통 초고속 적색 검강 (고화력 투사체)",
    },
    {
        "id": "xixing",
        "key": "4",
        "name": "흡성대법",
        "mp_cost": 30,
        "damage": 110,
        "range": 5.0,
        "proj": False,
        "aoe": True,
        "heal_hp": 0,
        "heal_mp": 0,
        "color": "#b388ff",
        "desc": "임아행의 패도 내공 (주변 적 광역 피해 + HP/MP 흡수)",
    },
    {
        "id": "zixia",
        "key": "5",
        "name": "자하진기",
        "mp_cost": 25,
        "damage": 0,
        "range": 0.0,
        "proj": False,
        "aoe": False,
        "heal_hp": 90,
        "heal_mp": 0,
        "color": "#69f0ae",
        "desc": "화산파 상승 내공 운기조식 (즉시 체력 +90 회복)",
    },
]

ENDINGS_META: dict[str, dict[str, Any]] = {
    "em1": {
        "id": "em1",
        "title": "엔딩 1 (EM1) · 화산의 검객, 강호에 남다",
        "music": "audio/adlib/em1_theme.wav",
        "gif": "cutscenes/em1/em1.gif",
        "frame_prefix": "cutscenes/em1/em1_",
        "frame_count": 58,
        "caption": "정파와 마교의 분쟁을 뒤로하고 영호충은 홀로 강호의 바람이 된다.",
    },
    "em2": {
        "id": "em2",
        "title": "엔딩 2 (EM2) · 소오강호(笑傲江湖)의 합주",
        "music": "audio/adlib/em1_theme.wav",
        "gif": "cutscenes/em2/em2.gif",
        "frame_prefix": "cutscenes/em2/em2_",
        "frame_count": 117,
        "caption": "유정풍과 곡양의 금소합주보를 이어받아 임영영과 함께 속세를 떠나 합주한다.",
    },
    "em3": {
        "id": "em3",
        "title": "엔딩 3 (EM3) · 독고구검의 전승자",
        "music": "audio/adlib/em1_theme.wav",
        "gif": "cutscenes/em3/em3.gif",
        "frame_prefix": "cutscenes/em3/em3_",
        "frame_count": 262,
        "caption": "화산 사과암의 깨달음을 바탕으로 무림의 진정한 태평을 연다.",
    },
    "d9": {
        "id": "d9",
        "title": "진 엔딩 (D9) · 흑목애 결전과 강호 은거",
        "music": "audio/adlib/d9_theme.wav",
        "gif": "cutscenes/d9/d9.gif",
        "frame_prefix": "cutscenes/d9/d9_",
        "frame_count": 375,
        "caption": "흑목애에서 동방불패와의 혈전을 끝내고, 모든 권력 다툼을 버린 채 자유를 택한다.",
    },
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

        if op == 0x81FF and any(st["op"] == "teleport" for st in steps):
            break

        if op == 0x8062 and p + 6 <= len(bc):
            slot, item_id = struct.unpack_from("<HH", bc, p + 2)
            if 0 < item_id < 20:
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
            "magics": [],
            "bullets": [],
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

    # 3b. MAGIC table (hdr[4] .. hdr[5]-1) & BULLET table (hdr[8] .. hdr[9]-1)
    magics: list[dict[str, Any]] = []
    if 0 <= hdr[4] < hdr[5] <= cnt:
        for m_idx in range(hdr[4], hdr[5]):
            mname, words = read_named_words(get_entry(m_idx))
            magics.append(
                {
                    "id": m_idx - hdr[4],
                    "name": mname,
                    "words": list(words[:10]),
                }
            )

    bullets: list[dict[str, Any]] = []
    if 0 <= hdr[8] < hdr[9] <= cnt:
        for b_idx in range(hdr[8], hdr[9]):
            bname, words = read_named_words(get_entry(b_idx))
            bullets.append(
                {
                    "id": b_idx - hdr[8],
                    "name": bname,
                    "words": list(words[:10]),
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
    companion_objs: list[dict[str, Any]] = []
    for s in range(1, 32):
        w = struct.unpack_from("<32H", stk_raw, s * 64)
        if w[2] != w[1] + 1 and (w[1] > 0 or w[2] > 0) and 1 <= w[14] <= 20000:
            phase_idx = (w[6] >> 8) & 0xFF
            if phase_idx >= len(phases):
                phase_idx = 0
            hp_cur = int(w[13]) if w[13] > 0 else int(w[14])
            hp_max = max(hp_cur, int(w[14]))
            pname = phases[phase_idx]["label"] if phase_idx < len(phases) else f"NPC #{s}"
            cx = round(w[1] / 256.0, 2)
            cy = round(w[2] / 256.0, 2)

            if s == 1 and (w[4] & 0x2000) != 0:
                raw_npc_comd = int(w[6] & 0xFF)
                npc_comd = raw_npc_comd if raw_npc_comd < len(comds) else 0
                if ch == 4 and npc_comd == 16 and len(comds) > 15:
                    npc_comd = 15
                npc_spr: int | None = None
                if phase_idx < len(phases):
                    for fid in phases[phase_idx]["frames"]:
                        sp = valid_ids.get(fid)
                        if sp and sp.get("orig_x", 0) < 48 and sp.get("w", 999) < 120:
                            npc_spr = fid
                            break
                cname = comds[npc_comd]["name"] if npc_comd < len(comds) else "NPC"
                companion_objs.append(
                    {
                        "slot": 100 + s,
                        "x": cx,
                        "y": cy,
                        "raw_spr": 0,
                        "spr_id": npc_spr,
                        "flags": int(w[4]),
                        "mode": int(w[5]),
                        "comd_id": npc_comd,
                        "phase_hint": phase_idx,
                        "item_id": 0,
                        "item_qty": 0,
                        "kind": "npc",
                        "label": f"{pname} ({cname} · 동행)",
                    }
                )
                continue

            is_boss = s == 1
            chars.append(
                {
                    "slot": s,
                    "x": cx,
                    "y": cy,
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

    objs.extend(companion_objs)

    # CH4 south-west exit trigger (COMD #16 'Target' checks LinPinZi <= 11.5, >= 119.5)
    if ch == 4 and len(comds) > 16 and any(st["op"] == "teleport" for st in comds[16]["steps"]):
        objs.append(
            {
                "slot": 99,
                "x": 11.0,
                "y": 120.0,
                "raw_spr": 16384,
                "spr_id": None,
                "flags": 0,
                "mode": 0,
                "comd_id": 16,
                "phase_hint": 0,
                "item_id": 0,
                "item_qty": 0,
                "kind": "portal",
                "label": "임평지 · 약왕묘 입구 (Target)",
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
        "magics": magics,
        "bullets": bullets,
        "comds": comds,
        "chars": chars,
        "objs": objs,
    }


def sample_ending_frames(eid: str, meta: dict[str, Any], max_frames: int = 36) -> list[str]:
    total = int(meta.get("frame_count", 0))
    prefix = str(meta.get("frame_prefix", ""))
    if total <= 0:
        return []
    if total <= max_frames:
        indices = list(range(total))
    else:
        indices = sorted({min(total - 1, round(i * (total - 1) / (max_frames - 1))) for i in range(max_frames)})
    return [f"{prefix}{idx:03d}.png" for idx in indices]


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

    endings_payload: dict[str, Any] = {}
    for eid, meta in ENDINGS_META.items():
        endings_payload[eid] = {
            **meta,
            "frames": sample_ending_frames(eid, meta, max_frames=36),
        }

    payload = {
        "version": 2,
        "active_chapters": [c["chapter"] for c in chapters if c["active"]],
        "speaker_names": {str(k): v for k, v in SPEAKER_NAMES.items()},
        "martial_arts": MARTIAL_ARTS,
        "endings": endings_payload,
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
