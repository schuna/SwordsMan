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
* **Phase 3: 코어 엔진 이식 및 오프닝·월드·이벤트 구동** *(완료)*
  * [x] `tools/build_world_data.py` (`npm run world-data`) 작성 및 `assets/extracted/world/chapters_data.json`(`628.2 KB`) 생성 (활성 **12개 챕터** `[0,1,2,4,5,6,7,8,11,12,13,14]`, 캐릭터 **127명**, 오브젝트 **136개**, 대사 **413라인**, `TER`/`PHASE`/`ITEM`/`COMD` 통합)
  * [x] TypeScript 기반 오프닝(`GT`→`TIT` + `tit_theme.wav`) 시퀀서, 45도 쿼터뷰 아이소메트릭 렌더러(`768×480` 2× 확장/깊이 정렬), `TER.blocking` 충돌 판정 및 이동, 보물상자·기초 전투·`defeat_comd` 트리거, `COMD` 바이트코드 인터프리터(`0x8025`/`0x8020`/`0x8028`/`0x8036`/`0x8062`), `KFONT.15` 초상화 대화창, 글로벌 HD↔DOS 실시간 모드 전환 구현 (`src/main.ts` → `public/app.js`, `public/index.html`, `public/styles.css`)
  * [x] 포트 `5188` 실전 플레이 탭(`#tab-play`) 라이브 브라우저 검증 완료 (오프닝/스킵, 대화 진행, 보물상자 획득, 보스 전투, 챕터 전환 `CH0`/`CH2`/`CH14`, HD↔DOS 실시간 전환, HTTP >= 400 오류 0건)
  * [x] Phase 3 완료 GitHub 동기화 (`schuna/SwordsMan`)
* **Phase 4: 전투·무공·UI 완성, 멀티 엔딩 및 폴리싱** *(완료)*
  * [x] `tools/build_world_data.py` 확장 및 `chapters_data.json`(`656.2 KB`) 재생성 (`EVENT` `MAGIC`/`BULLET` 섹션 메타데이터, 5대 무공 `화산검법`/`독고구검`/`벽사검법`/`흡성대법`/`자하진기`, 멀티 엔딩 4종 `EM1~3`/`D9` 시퀀스 내장)
  * [x] 전투·무공·UI/HUD 완결 (`src/main.ts` → `public/app.js`, `public/index.html`, `public/styles.css`): 무공 퀵슬롯(`1`~`5`) 및 장풍 투사체(`Projectile`)·흡성 광역·자하진기 운기조식·플로팅 데미지 팝업, 적 AI 추적·교전·위기 호신진기(`#gameAiToggle`), `128×128` 실시간 미니맵 이동/순간이동(`#gameMinimapCanvas`), 소지품 클릭 사용, `SV0~SV2` + `QUICK`(`F5`/`F9`) `localStorage` 세이브/로드, 멀티 엔딩(`EM1~3`, `D9`) 시퀀서 및 `CH14` 동방불패 격파 진엔딩 연동
  * [x] 포트 `5188` 최종 라이브 브라우저 검증 완료 (미니맵 길찾기, `독고구검` 투사체 & `흡성대법` 광역 흡수, `금창약` 사용, `SV0` 저장/챕터전환/복원, `D9` 엔딩 재생/스킵, 글로벌 `HD ↔ DOS 1×` 전환, `HTTP >= 400` 오류 0건)
  * [x] Phase 4 완료 및 프로젝트 최종 GitHub 동기화 (`schuna/SwordsMan`)

---

## 5. Phase 5: Public 공개 및 경량 고품질 엔진 전환 계획 (`CrimsonCore` 벤치마킹 반영)

### 5.1 방향성 및 핵심 원칙
1. **복잡한 하이브리드 구조 지양**:
   * 스튜디오 1~6 탭 및 원작 바이너리/외부 에셋(`sm/`, `assets/`) 이중 로더 등 복잡한 하이브리드 구성을 배제하고, **단일 플레이 전용 경량 웹/모바일 PWA 앱**으로 단순화합니다.
2. **CPU + 내장 GPU 사양 60fps 최적화**:
   * 무거운 3D 렌더링이나 대용량 이미지/WAV 로딩 대신, `CrimsonCore (classic-1993)` 방식의 **HTML5 2D Canvas 오프스크린 베이킹(`TileAtlas`, `imageSmoothingEnabled = false`) + Web Audio 실시간 합성**을 채택해 보급형 CPU + 내장 GPU 환경과 스마트폰에서도 안정적인 60fps를 보장합니다.
3. **두 프로젝트의 강점 결합**:
   * **`SwordsMan`에서 계승할 장점 (스토리·시나리오)**: 12챕터 진행 흐름, 챕터 간 사건 연결(`CH0~CH14`), NPC 대화/퀘스트/보물/비밀 이벤트 트리거, 5대 무공 해금 및 4종 멀티 엔딩 분기 내러티브.
   * **`CrimsonCore`에서 채택할 장점 (엔진·액션·디자인·저작권)**:
     * **모듈형 엔진 아키텍처**: `content / systems / engine / audio / ui` 계층 분리 및 `ReadOnlyUIState` + `CombatEvent[]` 이벤트 기반 HUD.
     * **고품질 2D 도트 & 신스**: 외부 파일 없이 코드로 생성되는 아이소메트릭 타일·도트 캐릭터·컷신 시퀀서 및 AdLib 5음계 Web Audio BGM/SFX.
     * **액션 전투 시스템**: `windup → active → recovery` 3단계 공격, 선입력 버퍼(`150ms`), 저스트 패링(내력 회복), 포이즈/그로기 극딜, 히트스톱(`50ms`), 경공 도약(`wz` + 그림자 분리), 보스 패턴 예고 장판(텔레그래프).

### 5.2 저작권 완전 해결 및 Public 공개 기준
* **외부 저작권 에셋 완전 제거**: `assets/`(`extracted/`, `remastered/`) 및 `chapters_data.json` 원작 데이터 의존성을 0%로 제거하여 저장소 클론 후 별도 파일 없이 즉시 실행 가능하도록 구성합니다.
* **IP·고유명사·대사 오리지널화**: 12챕터 스토리 라인과 무협 서사 구조(입문 → 강호 유랑 → 비급 수련 → 정파/마교 대립 → 최종 결전·멀티 엔딩)는 그대로 유지하되, 인물명·지명·무공명·대사 텍스트를 창작 오리지널 IP로 재작성하여 저작권 분쟁 소지를 원천 차단합니다.

### 5.3 단계별 실행 계획 (Phase 5.1 ~ 5.4)
* **Phase 5.1: 단일 파일 해체 및 모듈 아키텍처 개편**
  * [ ] `src/main.ts` 단일 파일 구조를 `src/content/`(챕터·무공·시나리오 데이터), `src/systems/`(월드·전투·세이브 순수 로직), `src/engine/`(아이소메트릭·타일·도트·컷신 렌더러), `src/audio/`(Web Audio AdLib 신스), `src/ui/`(데스크톱/모바일 통합 HUD 컨트롤러)로 분리
  * [ ] `ReadOnlyUIState` 스냅샷 및 `CombatEvent[]` 이벤트 버스 도입으로 게임 로직과 DOM/Canvas UI 완전 분리
* **Phase 5.2: 경량 2D 프로시저럴 그래픽·오디오 엔진 구축 (저작권 해소)**
  * [ ] `TileAtlas` 오프스크린 캔버스 타일셋 캐싱(청석, 목재 마루, 흙길, 대나무, 붉은 담장, 매화나무, 포탈, 보물상자 등)
  * [ ] 도트 캐릭터/NPC/보스 스프라이트 렌더러(8방향·걷기·검격·피격·`wz` 경공 도약 및 지상 그림자 분리) 및 레터박스 컷신 플레이어 구현
  * [ ] Web Audio 기반 5음계(궁·상·각·치·우) 필드/보스 BGM 및 검격·명중·패링·경공 효과음 신스 구축
* **Phase 5.3: 12챕터 스토리 시나리오 이식 및 액션 전투 고도화**
  * [ ] 기존 12챕터 사건 구조, NPC 대화/호위/보물/챕터 전환 트리거, 5대 무공, 4종 멀티 엔딩을 창작 IP 데이터셋으로 재구성해 이식
  * [ ] 3단계 공격 프레임(`windup/active/recovery`), 저스트 패링·포이즈·그로기·히트스톱, 적/보스 텔레그래프(적색 패링 가능 / 자색 회피 전용), 경험치·레벨업 성장 루프 적용
* **Phase 5.4: 통합 UI/UX 디자인 마감, 성능 검증 및 Public 전환**
  * [ ] 데스크톱 키보드/마우스와 모바일 터치 D-Pad·액션 버튼·드로어를 단일 반응형 UI로 통합 (보스 HP/포이즈 바, 콤보 배지, 플로팅 데미지, `SV0~SV2`/`QUICK` 저장, 오프라인 PWA 지원)
  * [ ] 내장 GPU/모바일 환경 60fps 프레임타임·메모리·콘솔 무오류 검증 및 GitHub 저장소 Public 공개 전환
