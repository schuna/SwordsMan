# 《소오강호 (동방불패, 1993)》 리마스터 개발 계획서

> **프로젝트명**: SwordsMan Remaster (`《소오강호 / 동방불패》 1993년 DOS판 현대화 리마스터`)  
> **선택 아키텍처**: **옵션 A — TypeScript + HTML5 Canvas / WebGL 웹 기반 하이브리드 엔진** (로컬 개발 서버 포트 `5188`, Node `v14.15.1` 호환)  
> **동기화 원칙**: 본 개발 계획서 및 각 Phase 완료 시 GitHub(`schuna/SwordsMan`) 동기화 수행

---

## 1. 프로젝트 개요 및 목표

### 1.1 대상 프로그램
* **원작 정보**: 대만 지관과기(Soft-World International) 개발, 1993년 MS-DOS용으로 출시되고 국내에 **《동방불패 (원제: 笑傲江湖 / Swordsman)》** 타이틀로 정식 한글화된 45도 쿼터뷰(Isometric) 무협 액션 RPG (`::Xiao:: v0.68`, Steve CHEN).
* **원본 무결성**: `sm/` 디렉터리 내 플로피 디스크 9장 분량(총 67개 파일, 약 16.9MB)이 손상 없이 100% 보존되어 있음을 `INSTALL.EXE` 매니페스트 대조로 확인 완료.

### 1.2 핵심 목표
1. **완벽한 리소스 추출**: 캐릭터/배경 이미지, 오프닝·엔딩 컷신 동영상, AdLib BGM 및 PCM 음성/효과음, 한글 폰트 및 대사를 100% 무손실 추출.
2. **원작의 충실한 재현 + 시청각 리마스터링**: 원본 데이터와 이벤트 스크립트를 현대 엔진에서 그대로 구동하되, 고화질 그래픽 업스케일링/32-bit 알파 블렌딩 및 고음질 오디오 리마스터링 적용(실시간 오리지널 ↔ 리마스터 토글 지원).
3. **UI 현대화 및 원작 결함 해결**: 매뉴얼 암호·체크섬 폭탄 제거, EMS 메모리 제한 해제, 쿼터뷰 조작성 개선, 고해상도 한글 UI/HUD/세이브 확장 제공.

---

## 2. 역공학 분석 사양 (Technical Specification)

### 2.1 실행 구조 (`SA.BAT` 파이프라인)
1. `SA.BAT` → `EM/SA.EXE` → `EM/TITLE.DTA`: 지관 로고(`GT.GRP`) 및 오프닝(`TIT.GRP` + `TIT.M`) 재생
2. `SM.EXE`: 메인 게임 엔진 (`521,731 Bytes`, 실제 실행 코드는 **약 55KB**, 나머지 ~450KB는 정적 버퍼)
   * `0x0000` (`~11.3KB`): C 메인 루프, 지역 로드(`REGION`), 세이브/로드(`SV0~SV2`), 8×8×8 RGB 반투명 LUT, 디버그 에디터
   * `0x02c5` (`~11.5KB`): Microsoft C 1990 런타임
   * `0x0595` (`~3.9KB`): 자체 LZSS 압축/해제 코덱 (`0x595:0x2d` / `0x595:0xca7`, 세이브용 압축 `0x595:0xdcc`)
   * `0x5e8d` (`~30.0KB`): 16-bit 어셈블리 코어(쿼터뷰 렌더러 `0x69da6`/`0x69e0e`, 전투/AI, 이벤트 바이트코드 인터프리터, `KFONT.15` 폰트 출력, EMS/사운드 브리지)
3. 엔딩 분기: `SM.EXE` 종료 코드 `(exit_code + 0xb1e0) & 3`에 따라 `EM/EM1.EXE`, `EM/EM2.EXE`, `EM/EM3.EXE`, `EM/D9.EXE` 실행

### 2.2 바이너리 및 에셋 포맷
| 구분 | 파일 | 포맷 및 디코딩 규격 |
| :--- | :--- | :--- |
| **자체 LZSS 코덱** | `EVENT.0~14`, `MAP.0~14`, `STK.0~14`, `CFGLBM*`, `MFX0.GRP`, `ALLGRP.REF`, `INDEKS`, `SEED.TBL` | `SM.EXE` `0x6956`(거리 테이블 23B), `0x696d`(길이 테이블 16B) 기반 16-bit 제어 워드 비트스트림 압축 (종료 마커 `0x109`) |
| **챕터/스프라이트/스크립트** | `EVENT/EVENT.0~14` | LZSS 해제 후 상단 32B 헤더(16개 워드) + 32-bit 오프셋 테이블. 14개 데이터 섹션(`PARM`, `PHASE`, `ACTION`, `MAGIC`, `TER`, `COMD`, `SCHED`, `NPC`, `BULLET`, `ILLUS`, `ITEM`, `EVENT`, `CHINE`, `VECT`)과 RLE(`0x69e0e`) 스프라이트 내장 |
| **월드/맵/오브젝트** | `REGION`, `MAP/MAP.0~14`, `STK/STK.0~14` | `REGION`(128B × 200개 비압축)이 `map/event/stk/mfx/voc` ID 매핑. `MAP`/`STK`는 LZSS 해제 시 각 `16,384B` |
| **인물 초상화 / UI** | `FACE.GRP`, `FACE.PAL`, `CFGLBM`, `CFGLBM0`, `PASS01~02.PCX` | `FACE.GRP`(`398,100B`) = `2,654B`(`0xA5E`) × 150개 RLE 초상화(`50×50`, `FACE.PAL` 6-bit RGB VGA 팔레트). `CFGLBM*`는 해제 시 `320×200 + 768B` 팔레트 |
| **오프닝/엔딩 컷신** | `EM/GT.GRP`, `EM/TIT.GRP`, `EM/EM1~3.GRP`, `EM/D9.GRP` (+`.IDX`) | `.IDX`는 끝 오프셋 `uint32` 배열. `GT`/`TIT`는 VGA 16색 4-Plane 연속 평면(`640×480` / `640×300`). `EM1~3`/`D9`는 `768B` 256색 팔레트, `4,096B` 페이드 LUT + `320×200` 키프레임/`0xFF` 투명 사각 블록/`0xFF`·`0x00` RLE 델타 프레임 |
| **디지털 음성/효과음** | `VOC/VOC0.GRP`, `EM/*V.GRP` (+`.IDX`) | `.IDX` 32-bit 끝 오프셋 테이블(`idx[i] - idx[i-1]` 길이). `8-bit Unsigned PCM` (`8,000Hz` 기본, Mono, `VOC0` 말미 `0x270e6` 이후는 도스 도구 슬랙 제외 14클립 유효) |
| **OPL2 FM 배경음악/SFX** | `MFX/MFX0.GRP`(+`.IDX`), `EM/TIT.M`, `EM/EM1.M`, `EM/D9.M` | `MFX0.GRP`는 LZSS 해제(`26,803B`) 후 16트랙 분리. `ADLIB.BIN`(`0x946`) OPL2 레지스터 시퀀스 바이트코드 (`72.8Hz` PIT 0x4006 틱, 14B 악기 패치) |
| **한글/영문 폰트** | `KFONT.15`, `EM/FONT.E16` | `KFONT.15`(`279,744B`) KS X 1001 16×16 한글 완성형 2,350자(32B/자), `FONT.E16`(`2,048B`) 8×16 영문 128자 |

### 2.3 원작의 알려진 문제점 및 해결 방안
1. **매뉴얼 암호 및 안티탬퍼 체크섬 폭탄 제거**: `SM.EXE` 시작 시 5명 초상화 인증(`0x222a`) 및 주행 중 체크섬 감시 루틴(`0x653b7`, 불일치 시 게임 메모리 `0x7a5b` 워드 0 초기화) 원천 제거.
2. **EMS 640KB 메모리 제약 해소**: `VOC0.GRP`(`618KB`) 재생 시 요구되던 `EMMXXXX0`(`INT 67h`) 의존성을 제거하여 모든 환경에서 100% 음성 출력 보장.
3. **45도 쿼터뷰 조작감 및 타이머 개선**: 8방향 키보드/WASD/마우스/게임패드 입력 지원, PIT 타이머(`72.8Hz`)와 렌더링 주사율 분리 및 프레임 보간.

---

## 3. 아키텍처 (옵션 A) 및 기술 스택

* **Core Engine**: TypeScript (Strict mode), HTML5 Canvas 2D + WebGL 셰이더 오버레이, Web Audio API
* **Build & Dev Server**: 로컬 `Node.js v14.15.1` (`npm 6.14.8`) 완전 호환 구성, 개발 서버 포트 **`5188`** 고정 (`5173` 회피)
* **Asset & Remaster Pipeline**: Python 3 (`Pillow`, 표준 라이브러리) 기반 추출기 및 리마스터 변환 파이프라인

---

## 4. 단계별 개발 로드맵 (Phase 1 ~ 4)

* **Phase 1: 에셋 전수 추출 파이프라인 및 웹 에셋 브라우저 구축** *(완료)*
  * [x] `sm/` 원본 리버스 엔지니어링 완료
  * [x] `tools/extract_assets.py` 작성 및 전체 에셋 무손실 추출 완료 (`assets/extracted/`, **1,189파일 / 77.76MB**: 인물 150, 컷신 6편/842프레임+GIF, 월드맵 15, 챕터 스프라이트 7,604개, 한글 대사 652줄, PCM WAV 103개, AdLib OPL2 WAV+MIDI 19트랙, KFONT.15 완성형 한글 2,350자)
  * [x] 포트 `5188` 웹 에셋 브라우저(`server.js`, `src/main.ts`, `public/`) 구축 및 6개 탭·콘솔/네트워크 무오류 검증 완료
  * [x] Phase 1 완료 GitHub 동기화 (`schuna/SwordsMan`)
* **Phase 2: 화질·음질 개선 파이프라인 및 A/B 비교 스튜디오 구축** *(완료)*
  * [x] `tools/remaster_assets.py` 작성 및 전수 리마스터링 완료 (`assets/remastered/`, **1,159파일 / 118.96MB**: 인물 150종 `200×200` 4x EPX + 디더링 제거 및 `faces_sheet_hd.png`, UI 화면 5종, 컷신 6편/842프레임 `640×400`/`640×480`/`640×300` EPX·디더링 제거 + GIF 5종, 월드맵 15종 `512×512` 4x EPX, 챕터 스프라이트 시트 15종 7,604개 2x EPX + `sprites_index_hd.json`, PCM 음성 103개 `22,050Hz` 16-bit Cubic Hermite 업샘플링·노이즈 게이트, AdLib OPL2 19트랙 `22,050Hz` 16-bit Exciter + LFO Chorus + Schroeder Hall Reverb 마스터링, `KFONT.15`/`FONT.E16` 2x EPX 시트)
  * [x] 포트 `5188` 웹 리마스터 스튜디오(`src/main.ts` → `public/app.js`, `public/index.html`, `public/styles.css`, `server.js`) 업그레이드 및 6개 탭 A/B 실시간 비교·글로벌 모드 토글·무오류 검증 완료
  * [x] Phase 2 완료 GitHub 동기화 (`schuna/SwordsMan`)
* **Phase 3: 코어 엔진 이식 및 오프닝·월드 구동**
  * TypeScript 기반 오프닝(`TIT`) 시퀀서 및 `SM.EXE` 1:1 데이터/바이트코드 구동 코어 구현
  * 45도 쿼터뷰 렌더러, 충돌 판정, 200개 지역 전환, NPC 대화 및 이벤트 스크립트 인터프리터, 고해상도 한글 폰트 UI 통합
  * Phase 3 완료 GitHub 동기화
* **Phase 4: 전투·무공·UI 완성, 멀티 엔딩 및 폴리싱**
  * AI/전투/장풍·이펙트, 인벤토리·무공 퀵슬롯 HUD, 미니맵, 확장 세이브(`SV0~SV2` 호환 + 퀵세이브), 실시간 오리지널↔리마스터 토글 완성
  * 멀티 엔딩(`EM1~3`, `D9`) 통합 및 최종 패키징, GitHub 동기화
