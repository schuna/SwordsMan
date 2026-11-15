"use strict";
const ASSET_BASE = '/assets/extracted/';
async function fetchJson(relPath) {
    const res = await fetch(ASSET_BASE + relPath);
    if (!res.ok)
        throw new Error('Failed to load ' + relPath);
    return (await res.json());
}
function loadImage(relOrUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Image load error: ' + relOrUrl));
        img.src = relOrUrl.startsWith('/') ? relOrUrl : ASSET_BASE + relOrUrl;
    });
}
function drawWithFilter(ctx, img, filterMode, targetW, targetH) {
    ctx.canvas.width = targetW;
    ctx.canvas.height = targetH;
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = filterMode === 'smooth';
    ctx.drawImage(img, 0, 0, targetW, targetH);
    if (filterMode === 'crt') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        for (let y = 0; y < targetH; y += 2) {
            ctx.fillRect(0, y, targetW, 1);
        }
        const grad = ctx.createRadialGradient(targetW / 2, targetH / 2, Math.min(targetW, targetH) * 0.3, targetW / 2, targetH / 2, Math.max(targetW, targetH) * 0.72);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.38)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, targetW, targetH);
    }
}
class SwordsManExplorer {
    constructor() {
        // Cutscene state
        this.sceneTimer = null;
        this.sceneFrames = [];
        this.scenePos = 0;
        // Sprite animator state
        this.sprTimer = null;
        this.currentSheetImg = null;
        this.currentChapterSprites = [];
        this.currentSprIdx = 0;
        // Audio analyser state
        this.audioCtx = null;
        this.analyser = null;
        this.waveRaf = null;
    }
    async init() {
        this.setupTabs();
        const statusPill = document.getElementById('statusPill');
        try {
            const [cat, pal, spr, dlg, fnt] = await Promise.all([
                fetchJson('catalog.json'),
                fetchJson('ui/palette.json'),
                fetchJson('events/sprites_index.json'),
                fetchJson('events/dialogues_ko.json'),
                fetchJson('fonts/font_bitmaps.json'),
            ]);
            this.catalog = cat;
            this.palettes = pal;
            this.spritesIndex = spr;
            this.dialogues = dlg;
            this.fontBitmaps = fnt;
            statusPill.textContent =
                `추출 완료 · 인물 ${cat.faces.count} · 스프라이트 ${cat.events.total_sprites} · 대사 ${cat.events.total_dialogues} · 오디오 ${cat.audio.voc_count + cat.audio.adlib_count}`;
            this.renderOverview();
            this.setupCutscenes();
            this.renderFaces();
            this.setupWorld();
            this.setupAudio();
            this.setupDialogues();
        }
        catch (err) {
            statusPill.textContent = '로딩 오류: ' + String(err);
            console.error(err);
        }
    }
    setupTabs() {
        const btns = Array.from(document.querySelectorAll('#tabNav .tab'));
        const panels = Array.from(document.querySelectorAll('.panel'));
        btns.forEach((btn) => {
            btn.addEventListener('click', () => {
                var _a;
                const target = btn.dataset.tab;
                btns.forEach((b) => b.classList.remove('active'));
                panels.forEach((p) => p.classList.remove('active'));
                btn.classList.add('active');
                (_a = document.getElementById('tab-' + target)) === null || _a === void 0 ? void 0 : _a.classList.add('active');
            });
        });
    }
    // -------------------------------------------------------------------------
    // Tab 1: Overview & UI / Palettes
    // -------------------------------------------------------------------------
    renderOverview() {
        const cat = this.catalog;
        const kpis = [
            { label: '캐릭터 초상화', val: `${cat.faces.count} 종`, sub: 'FACE.GRP (50×50 RLE)' },
            { label: '컷신 시퀀스', val: `${Object.keys(cat.cutscenes).length} 편`, sub: 'GT · TIT · EM1~3 · D9' },
            { label: '챕터 월드 & 스프라이트', val: `${cat.events.total_sprites} 개`, sub: 'MAP/STK/EVENT 0~14' },
            { label: '한국어 대사/텍스트', val: `${cat.events.total_dialogues} 줄`, sub: 'CP949 + KFONT.15 (2,350자)' },
            { label: 'PCM 음성/효과음', val: `${cat.audio.voc_count} 클립`, sub: 'VOC0 · D9V · E1~3V (WAV)' },
            { label: 'AdLib OPL2 음악', val: `${cat.audio.adlib_count} 트랙`, sub: 'FM Synth WAV + MIDI' },
        ];
        const grid = document.getElementById('kpiGrid');
        grid.innerHTML = kpis
            .map((k) => `<div class="kpi-card"><div class="label">${k.label}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`)
            .join('');
        const screenSel = document.getElementById('uiScreenSelect');
        const filterSel = document.getElementById('uiFilterSelect');
        const scaleSel = document.getElementById('uiScaleSelect');
        const uiCanvas = document.getElementById('uiCanvas');
        const uiInfo = document.getElementById('uiInfo');
        const redrawUi = async () => {
            const img = await loadImage(screenSel.value);
            const scale = Number(scaleSel.value) || 2;
            const w = img.width * scale;
            const h = img.height * scale;
            drawWithFilter(uiCanvas.getContext('2d'), img, filterSel.value, w, h);
            uiInfo.textContent = `원본 ${img.width}×${img.height} → 출력 ${w}×${h} (${filterSel.value})`;
        };
        screenSel.addEventListener('change', redrawUi);
        filterSel.addEventListener('change', redrawUi);
        scaleSel.addEventListener('change', redrawUi);
        redrawUi();
        // Palette swatch viewer
        const palSel = document.getElementById('palSelect');
        const palCanvas = document.getElementById('palCanvas');
        const readout = document.getElementById('palReadout');
        let currentPal = this.palettes.face_pal;
        const drawPalette = () => {
            const key = palSel.value;
            if (key === 'face_pal') {
                currentPal = this.palettes.face_pal;
            }
            else {
                const idx = Number(key.replace('pal_idx_', ''));
                currentPal = this.palettes.pal_idx[idx] || this.palettes.face_pal;
            }
            const ctx = palCanvas.getContext('2d');
            const cell = 24;
            for (let i = 0; i < 256; i++) {
                const [r, g, b] = currentPal[i] || [0, 0, 0];
                const row = Math.floor(i / 16);
                const col = i % 16;
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(col * cell, row * cell, cell, cell);
            }
        };
        palCanvas.addEventListener('mousemove', (e) => {
            const rect = palCanvas.getBoundingClientRect();
            const x = Math.floor(((e.clientX - rect.left) / rect.width) * 16);
            const y = Math.floor(((e.clientY - rect.top) / rect.height) * 16);
            const idx = Math.max(0, Math.min(255, y * 16 + x));
            const [r, g, b] = currentPal[idx] || [0, 0, 0];
            const hex = '#' +
                [r, g, b]
                    .map((v) => v.toString(16).padStart(2, '0'))
                    .join('')
                    .toUpperCase();
            readout.innerHTML = `<span style="display:inline-block;width:14px;height:14px;background:${hex};vertical-align:middle;border:1px solid #fff;margin-right:6px"></span> Index #${idx} (0x${idx.toString(16).padStart(2, '0')}) — RGB(${r}, ${g}, ${b}) · ${hex}`;
        });
        palSel.addEventListener('change', drawPalette);
        drawPalette();
    }
    // -------------------------------------------------------------------------
    // Tab 2: Cutscene Theater
    // -------------------------------------------------------------------------
    setupCutscenes() {
        const sel = document.getElementById('sceneSelect');
        const filterSel = document.getElementById('sceneFilter');
        const playBtn = document.getElementById('scenePlayBtn');
        const prevBtn = document.getElementById('scenePrevBtn');
        const nextBtn = document.getElementById('sceneNextBtn');
        const scrubber = document.getElementById('sceneScrubber');
        const speedInput = document.getElementById('sceneSpeedInput');
        const frameLabel = document.getElementById('sceneFrameLabel');
        const metaBox = document.getElementById('sceneMetaBox');
        const gifPreview = document.getElementById('sceneGifPreview');
        const canvas = document.getElementById('sceneCanvas');
        const audio = document.getElementById('sceneAudio');
        const bgmLabel = document.getElementById('sceneBgmLabel');
        const bgmMap = {
            tit: 'audio/adlib/tit_theme.wav',
            em1: 'audio/adlib/em1_theme.wav',
            em2: 'audio/adlib/mfx0_01.wav',
            em3: 'audio/adlib/mfx0_03.wav',
            d9: 'audio/adlib/d9_theme.wav',
            gt: 'audio/adlib/mfx0_02.wav',
        };
        const stopPlay = () => {
            if (this.sceneTimer !== null) {
                window.clearInterval(this.sceneTimer);
                this.sceneTimer = null;
            }
            playBtn.textContent = '▶ 재생 (음악 동기화)';
        };
        const renderFrame = (idx) => {
            if (!this.sceneFrames.length)
                return;
            this.scenePos = Math.max(0, Math.min(this.sceneFrames.length - 1, idx));
            const img = this.sceneFrames[this.scenePos];
            const scale = img.width <= 320 ? 2 : 1;
            drawWithFilter(canvas.getContext('2d'), img, filterSel.value, img.width * scale, img.height * scale);
            scrubber.value = String(this.scenePos);
            frameLabel.textContent = `${this.scenePos + 1} / ${this.sceneFrames.length}`;
        };
        const loadScene = async () => {
            stopPlay();
            const key = sel.value;
            const entry = this.catalog.cutscenes[key];
            if (!entry)
                return;
            speedInput.value = String(entry.frame_ms || 120);
            metaBox.innerHTML =
                `<strong>${key.toUpperCase()}</strong> · 해상도: ${entry.width}×${entry.height} · 총 프레임: ${entry.frames.length}`;
            if (entry.gif) {
                gifPreview.src = ASSET_BASE + entry.gif;
                gifPreview.style.display = 'block';
            }
            else {
                gifPreview.style.display = 'none';
            }
            const bgm = bgmMap[key] || 'audio/adlib/tit_theme.wav';
            audio.src = ASSET_BASE + bgm;
            bgmLabel.textContent = '연동 BGM: ' + bgm.split('/').pop();
            frameLabel.textContent = '프레임 로딩 중...';
            // Progressive load first frame immediately then remaining
            this.sceneFrames = [];
            const firstImg = await loadImage(entry.frames[0]);
            this.sceneFrames = new Array(entry.frames.length).fill(firstImg);
            scrubber.max = String(Math.max(0, entry.frames.length - 1));
            renderFrame(0);
            Promise.all(entry.frames.map((p) => loadImage(p))).then((imgs) => {
                if (sel.value === key) {
                    this.sceneFrames = imgs;
                    renderFrame(this.scenePos);
                }
            });
        };
        playBtn.addEventListener('click', () => {
            if (this.sceneTimer !== null) {
                stopPlay();
                audio.pause();
                return;
            }
            const ms = Math.max(30, Number(speedInput.value) || 100);
            playBtn.textContent = '⏸ 일시정지';
            audio.play().catch(() => { });
            this.sceneTimer = window.setInterval(() => {
                const next = (this.scenePos + 1) % Math.max(1, this.sceneFrames.length);
                renderFrame(next);
            }, ms);
        });
        prevBtn.addEventListener('click', () => renderFrame(this.scenePos - 1));
        nextBtn.addEventListener('click', () => renderFrame(this.scenePos + 1));
        scrubber.addEventListener('input', () => renderFrame(Number(scrubber.value)));
        filterSel.addEventListener('change', () => renderFrame(this.scenePos));
        sel.addEventListener('change', loadScene);
        loadScene();
    }
    // -------------------------------------------------------------------------
    // Tab 3: Faces
    // -------------------------------------------------------------------------
    renderFaces() {
        const grid = document.getElementById('facesGrid');
        const search = document.getElementById('faceSearch');
        const origC = document.getElementById('faceOrigCanvas');
        const nearC = document.getElementById('faceNearCanvas');
        const smoothC = document.getElementById('faceSmoothCanvas');
        const selLabel = document.getElementById('faceSelId');
        const count = this.catalog.faces.count;
        let selectedId = 0;
        const selectFace = async (idx) => {
            selectedId = idx;
            const pad = String(idx).padStart(3, '0');
            selLabel.textContent = pad;
            const img = await loadImage(`faces/face_${pad}.png`);
            drawWithFilter(origC.getContext('2d'), img, 'nearest', 50, 50);
            drawWithFilter(nearC.getContext('2d'), img, 'nearest', 200, 200);
            drawWithFilter(smoothC.getContext('2d'), img, 'smooth', 200, 200);
            Array.from(grid.children).forEach((el) => {
                el.classList.toggle('active', Number(el.dataset.id) === idx);
            });
        };
        const populate = (filterStr) => {
            const f = filterStr.trim();
            const items = [];
            for (let i = 0; i < count; i++) {
                const pad = String(i).padStart(3, '0');
                if (f && !pad.includes(f) && !String(i).includes(f))
                    continue;
                items.push(`<div class="face-item ${i === selectedId ? 'active' : ''}" data-id="${i}">
            <img src="${ASSET_BASE}faces/face_${pad}.png" alt="#${pad}" loading="lazy" />
            <span>#${pad}</span>
          </div>`);
            }
            grid.innerHTML = items.join('');
        };
        grid.addEventListener('click', (e) => {
            const item = e.target.closest('.face-item');
            if (item && item.dataset.id !== undefined) {
                selectFace(Number(item.dataset.id));
            }
        });
        search.addEventListener('input', () => populate(search.value));
        populate('');
        selectFace(0);
    }
    // -------------------------------------------------------------------------
    // Tab 4: World Maps & Chapter Sprites
    // -------------------------------------------------------------------------
    setupWorld() {
        const chSel = document.getElementById('chapterSelect');
        const chStats = document.getElementById('chapterStats');
        const mapLabel = document.getElementById('mapChLabel');
        const mapCanvas = document.getElementById('mapCanvas');
        const worldMetaBox = document.getElementById('worldMetaBox');
        const sheetCanvas = document.getElementById('sheetCanvas');
        const zoomCanvas = document.getElementById('spriteZoomCanvas');
        const detailMeta = document.getElementById('spriteDetailMeta');
        const sprIdxLabel = document.getElementById('sprIdxLabel');
        const playBtn = document.getElementById('sprPlayBtn');
        const prevBtn = document.getElementById('sprPrevBtn');
        const nextBtn = document.getElementById('sprNextBtn');
        chSel.innerHTML = this.catalog.world.maps
            .map((m) => { var _a; return `<option value="${m.chapter}">Chapter ${String(m.chapter).padStart(2, '0')} (${((_a = this.spritesIndex.chapters[m.chapter]) === null || _a === void 0 ? void 0 : _a.sprite_count) || 0} 스프라이트)</option>`; })
            .join('');
        const stopSprAnim = () => {
            if (this.sprTimer !== null) {
                window.clearInterval(this.sprTimer);
                this.sprTimer = null;
            }
            playBtn.textContent = '▶ 애니 재생';
        };
        const drawSpriteFrame = (idx) => {
            if (!this.currentSheetImg || !this.currentChapterSprites.length)
                return;
            this.currentSprIdx = (idx + this.currentChapterSprites.length) % this.currentChapterSprites.length;
            const sp = this.currentChapterSprites[this.currentSprIdx];
            sprIdxLabel.textContent = `${this.currentSprIdx + 1} / ${this.currentChapterSprites.length}`;
            const zctx = zoomCanvas.getContext('2d');
            zctx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
            zctx.imageSmoothingEnabled = false;
            const scale = Math.max(1, Math.min(4, Math.floor(176 / Math.max(sp.w, sp.h))));
            const dw = sp.w * scale;
            const dh = sp.h * scale;
            const dx = Math.floor((zoomCanvas.width - dw) / 2);
            const dy = Math.floor((zoomCanvas.height - dh) / 2);
            zctx.drawImage(this.currentSheetImg, sp.sx, sp.sy, sp.w, sp.h, dx, dy, dw, dh);
            detailMeta.innerHTML =
                `<div><strong>Entry ID:</strong> #${sp.id}</div>` +
                    `<div><strong>크기:</strong> ${sp.w} × ${sp.h} px (${scale}x 확대)</div>` +
                    `<div><strong>원본 VGA 오프셋:</strong> (${sp.orig_x}, ${sp.orig_y})</div>` +
                    `<div><strong>시트 좌표:</strong> (${sp.sx}, ${sp.sy})</div>`;
            // Highlight selected box on sheet
            const sctx = sheetCanvas.getContext('2d');
            sctx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
            sctx.drawImage(this.currentSheetImg, 0, 0);
            sctx.strokeStyle = '#d4a853';
            sctx.lineWidth = 2;
            sctx.strokeRect(sp.sx - 1, sp.sy - 1, sp.w + 2, sp.h + 2);
        };
        const loadChapter = async (ch) => {
            stopSprAnim();
            mapLabel.textContent = String(ch);
            const mapInfo = this.catalog.world.maps[ch];
            const stkInfo = this.catalog.world.stk[ch];
            const sprCh = this.spritesIndex.chapters[ch];
            chStats.textContent = `타일 종류 ${mapInfo.unique_tile_ids} · 비영점 셀 ${mapInfo.non_zero_cells}/16,384 · STK ${stkInfo.non_zero}B`;
            worldMetaBox.innerHTML =
                `<strong>MAP.${ch}</strong> (${mapInfo.width}×${mapInfo.height} = 16,384B) · 고유 타일 ID: ${mapInfo.unique_tile_ids}개<br>` +
                    `<strong>STK.${ch}</strong>: ${stkInfo.bytes.toLocaleString()}B (활성 ${stkInfo.non_zero.toLocaleString()}B)<br>` +
                    `<strong>공통:</strong> REGION (${this.catalog.world.region.rows}×${this.catalog.world.region.stride}) · SEED.TBL (${this.catalog.world.seed_tbl_decompressed_bytes}B)`;
            const mapImg = await loadImage(mapInfo.image);
            drawWithFilter(mapCanvas.getContext('2d'), mapImg, 'nearest', 384, 384);
            this.currentSheetImg = await loadImage(sprCh.sheet);
            this.currentChapterSprites = sprCh.sprites;
            sheetCanvas.width = this.currentSheetImg.width;
            sheetCanvas.height = this.currentSheetImg.height;
            drawSpriteFrame(0);
        };
        sheetCanvas.addEventListener('click', (e) => {
            const rect = sheetCanvas.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * sheetCanvas.width;
            const y = ((e.clientY - rect.top) / rect.height) * sheetCanvas.height;
            const hit = this.currentChapterSprites.findIndex((sp) => x >= sp.sx && x <= sp.sx + sp.w && y >= sp.sy && y <= sp.sy + sp.h);
            if (hit >= 0)
                drawSpriteFrame(hit);
        });
        playBtn.addEventListener('click', () => {
            if (this.sprTimer !== null) {
                stopSprAnim();
                return;
            }
            playBtn.textContent = '⏸ 정지';
            this.sprTimer = window.setInterval(() => drawSpriteFrame(this.currentSprIdx + 1), 160);
        });
        prevBtn.addEventListener('click', () => drawSpriteFrame(this.currentSprIdx - 1));
        nextBtn.addEventListener('click', () => drawSpriteFrame(this.currentSprIdx + 1));
        chSel.addEventListener('change', () => loadChapter(Number(chSel.value)));
        loadChapter(0);
    }
    // -------------------------------------------------------------------------
    // Tab 5: Audio Studio (AdLib OPL2 + PCM VOC)
    // -------------------------------------------------------------------------
    setupAudio() {
        const player = document.getElementById('mainAudioPlayer');
        const nowPlaying = document.getElementById('audioNowPlaying');
        const rateSel = document.getElementById('vocRateSelect');
        const adlibList = document.getElementById('adlibList');
        const vocList = document.getElementById('vocList');
        const bankFilter = document.getElementById('vocBankFilter');
        const waveCanvas = document.getElementById('waveCanvas');
        const ensureAnalyser = () => {
            if (this.analyser)
                return;
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC)
                return;
            this.audioCtx = new AC();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            const src = this.audioCtx.createMediaElementSource(player);
            src.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);
            const buf = new Uint8Array(this.analyser.frequencyBinCount);
            const wctx = waveCanvas.getContext('2d');
            const renderWave = () => {
                this.waveRaf = requestAnimationFrame(renderWave);
                this.analyser.getByteTimeDomainData(buf);
                const w = waveCanvas.width;
                const h = waveCanvas.height;
                wctx.fillStyle = '#07090e';
                wctx.fillRect(0, 0, w, h);
                wctx.strokeStyle = '#3da88e';
                wctx.lineWidth = 2;
                wctx.beginPath();
                const slice = w / buf.length;
                for (let i = 0; i < buf.length; i++) {
                    const y = (buf[i] / 255) * h;
                    if (i === 0)
                        wctx.moveTo(0, y);
                    else
                        wctx.lineTo(i * slice, y);
                }
                wctx.stroke();
            };
            renderWave();
        };
        const playTrack = (relPath, label, isVoc) => {
            ensureAnalyser();
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume().catch(() => { });
            }
            player.src = ASSET_BASE + relPath;
            player.playbackRate = isVoc ? Number(rateSel.value) || 1.0 : 1.0;
            nowPlaying.textContent = label;
            player.play().catch(() => { });
        };
        rateSel.addEventListener('change', () => {
            var _a;
            if ((_a = nowPlaying.textContent) === null || _a === void 0 ? void 0 : _a.includes('[VOC]')) {
                player.playbackRate = Number(rateSel.value) || 1.0;
            }
        });
        adlibList.innerHTML = this.catalog.audio.adlib
            .map((t) => `<div class="list-row">
            <div>
              <strong>${t.title}</strong>
              <div class="hint">${t.duration_sec}s · ${t.notes} 음표 · 악기 ${t.instruments}개</div>
            </div>
            <div class="controls-inline">
              <button class="btn primary play-adlib" data-src="${t.wav}" data-label="[AdLib] ${t.title}">▶ WAV</button>
              <a class="btn" href="${ASSET_BASE}${t.midi}" download>MIDI</a>
            </div>
          </div>`)
            .join('');
        adlibList.addEventListener('click', (e) => {
            const btn = e.target.closest('.play-adlib');
            if (btn && btn.dataset.src) {
                playTrack(btn.dataset.src, btn.dataset.label || btn.dataset.src, false);
            }
        });
        const renderVocList = () => {
            const bank = bankFilter.value;
            const filtered = this.catalog.audio.voc.filter((v) => bank === 'ALL' || v.bank === bank);
            vocList.innerHTML = filtered
                .map((v) => `<div class="list-row clickable play-voc" data-src="${v.file}" data-label="[VOC] ${v.id}">
              <div>
                <span class="badge">${v.bank}</span> <strong>${v.id}</strong>
                <span class="hint">(${v.bytes.toLocaleString()}B · ${v.duration_sec}s @ 8kHz)</span>
              </div>
              <button class="btn">▶ 재생</button>
            </div>`)
                .join('');
        };
        vocList.addEventListener('click', (e) => {
            const row = e.target.closest('.play-voc');
            if (row && row.dataset.src) {
                playTrack(row.dataset.src, row.dataset.label || row.dataset.src, true);
            }
        });
        bankFilter.addEventListener('change', renderVocList);
        renderVocList();
    }
    // -------------------------------------------------------------------------
    // Tab 6: Dialogues & KFONT.15 Bitmap Renderer
    // -------------------------------------------------------------------------
    setupDialogues() {
        const chSel = document.getElementById('dlgChapterSelect');
        const search = document.getElementById('dlgSearch');
        const dlgList = document.getElementById('dlgList');
        const kfontInput = document.getElementById('kfontInput');
        const kfontCanvas = document.getElementById('kfontCanvas');
        const modeSel = document.getElementById('fontRenderMode');
        chSel.innerHTML =
            `<option value="-1">전체 챕터 (${this.dialogues.total_lines}줄)</option>` +
                this.dialogues.chapters
                    .map((c) => `<option value="${c.chapter}">Chapter ${c.chapter} (${c.line_count}줄)</option>`)
                    .join('');
        const drawKfontText = () => {
            const ctx = kfontCanvas.getContext('2d');
            const scale = 2;
            const w = kfontCanvas.width;
            const h = kfontCanvas.height;
            ctx.fillStyle = '#07090e';
            ctx.fillRect(0, 0, w, h);
            const text = kfontInput.value || '';
            const isRemaster = modeSel.value === 'remaster';
            let cursorX = 12;
            let cursorY = 14;
            const maxW = w - 20;
            const drawGlyphBits = (hex, cols, gx, gy, color) => {
                ctx.fillStyle = color;
                const bytesPerRow = cols === 16 ? 2 : 1;
                for (let r = 0; r < 16; r++) {
                    const rowHex = hex.slice(r * bytesPerRow * 2, (r + 1) * bytesPerRow * 2);
                    const val = parseInt(rowHex, 16) || 0;
                    for (let c = 0; c < cols; c++) {
                        if ((val >> (cols - 1 - c)) & 1) {
                            ctx.fillRect(gx + c * scale, gy + r * scale, scale, scale);
                        }
                    }
                }
            };
            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                if (ch === '\n') {
                    cursorX = 12;
                    cursorY += 20 * scale;
                    continue;
                }
                const code = ch.charCodeAt(0);
                if (code < 128) {
                    const glyphHex = this.fontBitmaps.ascii_8x16[code] || this.fontBitmaps.ascii_8x16[32];
                    if (cursorX + 8 * scale > maxW) {
                        cursorX = 12;
                        cursorY += 20 * scale;
                    }
                    if (isRemaster) {
                        drawGlyphBits(glyphHex, 8, cursorX + 2, cursorY + 2, '#111622');
                    }
                    drawGlyphBits(glyphHex, 8, cursorX, cursorY, isRemaster ? '#ffe9b8' : '#e6d2a0');
                    cursorX += 9 * scale;
                }
                else {
                    const glyphHex = this.fontBitmaps.hangul_16x16[ch];
                    if (cursorX + 16 * scale > maxW) {
                        cursorX = 12;
                        cursorY += 20 * scale;
                    }
                    if (glyphHex) {
                        if (isRemaster) {
                            drawGlyphBits(glyphHex, 16, cursorX + 2, cursorY + 2, '#2b1212');
                        }
                        drawGlyphBits(glyphHex, 16, cursorX, cursorY, isRemaster ? '#ffe9b8' : '#f2e0b2');
                    }
                    else {
                        ctx.fillStyle = '#d4a853';
                        ctx.font = `${14 * scale}px "Malgun Gothic", sans-serif`;
                        ctx.fillText(ch, cursorX, cursorY + 14 * scale);
                    }
                    cursorX += 17 * scale;
                }
                if (cursorY + 16 * scale > h)
                    break;
            }
        };
        const renderDlgList = () => {
            const ch = Number(chSel.value);
            const q = search.value.trim().toLowerCase();
            const rows = [];
            for (const c of this.dialogues.chapters) {
                if (ch >= 0 && c.chapter !== ch)
                    continue;
                for (const l of c.lines) {
                    if (q && !l.text.toLowerCase().includes(q))
                        continue;
                    rows.push({ ch: c.chapter, entry: l.entry, text: l.text });
                    if (rows.length >= 250)
                        break;
                }
                if (rows.length >= 250)
                    break;
            }
            dlgList.innerHTML = rows
                .map((r) => `<div class="list-row clickable dlg-row" data-text="${r.text.replace(/"/g, '&quot;')}">
              <div><span class="badge">CH${r.ch}#${r.entry}</span> ${r.text}</div>
            </div>`)
                .join('');
        };
        dlgList.addEventListener('click', (e) => {
            const row = e.target.closest('.dlg-row');
            if (row && row.dataset.text) {
                kfontInput.value = row.dataset.text;
                drawKfontText();
            }
        });
        chSel.addEventListener('change', renderDlgList);
        search.addEventListener('input', renderDlgList);
        kfontInput.addEventListener('input', drawKfontText);
        modeSel.addEventListener('change', drawKfontText);
        renderDlgList();
        drawKfontText();
    }
}
window.addEventListener('DOMContentLoaded', () => {
    new SwordsManExplorer().init();
});
