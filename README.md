# 《소오강호 (동방불패, 1993)》 리마스터 프로젝트 (SwordsMan Remaster)

1993년 대만 지관과기(Soft-World International)에서 제작하고 국내에 《동방불패》로 정식 한글화 출시된 MS-DOS 무협 액션 RPG 《소오강호(笑傲江湖 / Swordsman)》를 현대 웹/데스크톱 환경(TypeScript + HTML5 Canvas/WebGL)으로 충실히 재현하고 화질·음질·UI·조작성을 개선하는 리마스터 프로젝트입니다.

## 주요 문서
* [개발 계획서 (DEVELOPMENT_PLAN.md)](./DEVELOPMENT_PLAN.md)

## 디렉터리 구조
* `sm/` — 1993년 MS-DOS 원본 게임 파일 전체 (디스크 1~9 무결성 보존)
* `tools/` — 원본 바이너리/LZSS/RLE/OPL2/PCM/폰트 추출 및 리마스터링 파이프라인
* `assets/extracted/` — 원본에서 추출된 PNG, GIF, WAV, MIDI, JSON 에셋
* `assets/remastered/` — Phase 2 리마스터(EPX/디더링 제거/DSP 마스터링) 고화질·고음질 에셋
* `src/`, `public/`, `server.js` — 웹 기반 에셋 브라우저 및 TypeScript/Canvas 리마스터 엔진

## 로컬 실행 환경 및 빠른 시작
* **Node.js**: `v14.15.1` 호환 (`npm 6.14.8`), **Python**: 3.x (`Pillow`)
* **개발 서버 포트**: `5188` (`http://127.0.0.1:5188`)
```bash
npm install
npm run extract     # sm/ 원본에서 assets/extracted/ 전수 추출 (이미 추출됨)
npm run remaster    # Phase 2 화질·음질 리마스터 에셋 생성 (assets/remastered/)
npm run world-data  # Phase 3 월드/챕터/이벤트 데이터 생성 (chapters_data.json)
npm run build       # src/main.ts -> public/app.js 컴파일
npm start           # http://127.0.0.1:5188 웹 리마스터 엔진 및 스튜디오 실행
```

## 진행 현황
* [x] **사전 검토**: 바이너리 역공학, 압축 알고리즘 해독 및 타당성 보고서 완료
* [x] **Phase 1**: 전체 에셋 무손실 추출(`1,189`파일, `77.76MB`) 및 포트 `5188` 웹 에셋 브라우저 구축·검증 완료
* [x] **Phase 2**: 그래픽·사운드 리마스터링(`1,159`파일, `118.96MB`) 및 6개 탭 A/B 비교 스튜디오 구축·검증 완료
* [x] **Phase 3**: 코어 엔진 이식 및 오프닝(`GT→TIT`)·쿼터뷰 월드(12챕터)·`COMD` 이벤트·전투·`KFONT.15` 대화창·실시간 HD↔DOS 전환 구축·검증 완료
* [ ] **Phase 4**: 전투·무공·UI/HUD 고도화, 세이브/로드(`SV0~SV2` 호환) 및 멀티 엔딩(`EM1~3`, `D9`) 통합
