"use strict";
const ASSET_BASE = '/assets/extracted/';
const REMASTER_BASE = '/assets/remastered/';
async function fetchJson(relPath, base = ASSET_BASE) {
    const res = await fetch(base + relPath);
    if (!res.ok)
        throw new Error('Failed to load ' + base + relPath);
    return (await res.json());
}
function loadImage(relOrUrl, base = ASSET_BASE) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Image load error: ' + relOrUrl));
        img.src = relOrUrl.startsWith('/') ? relOrUrl : base + relOrUrl;
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
        this.spritesIndexHd = null;
        // Cutscene state
        this.sceneTimer = null;
        this.sceneFrames = [];
        this.scenePos = 0;
        // Sprite animator state
        this.sprTimer = null;
        this.currentSheetImg = null;
        this.origSheetImg = null;
        this.remSheetImg = null;
        this.currentChapterSprites = [];
        this.origChapterSprites = [];
        this.hdChapterSprites = [];
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
            const [cat, pal, spr, sprHd, dlg, fnt] = await Promise.all([
                fetchJson('catalog.json'),
                fetchJson('ui/palette.json'),
                fetchJson('events/sprites_index.json'),
                fetchJson('events/sprites_index_hd.json', REMASTER_BASE).catch(() => null),
                fetchJson('events/dialogues_ko.json'),
                fetchJson('fonts/font_bitmaps.json'),
            ]);
            this.catalog = cat;
            this.palettes = pal;
            this.spritesIndex = spr;
            this.spritesIndexHd = sprHd;
            this.dialogues = dlg;
            this.fontBitmaps = fnt;
            statusPill.textContent =
                `Phase 2 리마스터 · 인물 ${cat.faces.count} (4x EPX) · 스프라이트 ${cat.events.total_sprites} (2x EPX) · 대사 ${cat.events.total_dialogues} · 오디오 ${cat.audio.voc_count + cat.audio.adlib_count}`;
            this.renderOverview();
            this.setupCutscenes();
            this.renderFaces();
            this.setupWorld();
            this.setupAudio();
            this.setupDialogues();
            this.setupGlobalModeToggle();
        }
        catch (err) {
            statusPill.textContent = '로딩 오류: ' + String(err);
            console.error(err);
        }
    }
    setupGlobalModeToggle() {
        const btn = document.getElementById('globalModeToggle');
        if (!btn)
            return;
        btn.addEventListener('click', () => {
            const nextHd = btn.dataset.mode !== 'remastered';
            btn.dataset.mode = nextHd ? 'remastered' : 'extracted';
            btn.textContent = nextHd ? '✨ 리마스터 HD (Phase 2)' : '🕹 원본 DOS 모드 (1993)';
            btn.classList.toggle('primary', nextHd);
            const syncSelect = (id, val) => {
                const el = document.getElementById(id);
                if (el) {
                    el.value = val;
                    el.dispatchEvent(new Event('change'));
                }
            };
            syncSelect('uiFilterSelect', nextHd ? 'remastered' : 'nearest');
            syncSelect('sceneSourceSelect', nextHd ? 'remastered' : 'extracted');
            syncSelect('facesGridToggle', nextHd ? 'remastered' : 'extracted');
            syncSelect('worldRemasterToggle', nextHd ? 'remastered' : 'extracted');
            syncSelect('vocRemasterToggle', nextHd ? 'remastered' : 'extracted');
            syncSelect('fontRenderMode', nextHd ? 'phase2' : 'dos');
        });
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
        const splitBar = document.getElementById('uiSplitBar');
        const splitRange = document.getElementById('uiSplitRange');
        const splitPct = document.getElementById('uiSplitPct');
        const uiCanvas = document.getElementById('uiCanvas');
        const uiInfo = document.getElementById('uiInfo');
        const redrawUi = async () => {
            const scale = Number(scaleSel.value) || 2;
            const mode = filterSel.value;
            if (mode === 'remastered') {
                splitBar.style.display = 'flex';
                const [origImg, remImg] = await Promise.all([
                    loadImage(screenSel.value, ASSET_BASE),
                    loadImage(screenSel.value, REMASTER_BASE),
                ]);
                const targetW = origImg.width * scale;
                const targetH = origImg.height * scale;
                const ctx = uiCanvas.getContext('2d');
                ctx.canvas.width = targetW;
                ctx.canvas.height = targetH;
                ctx.clearRect(0, 0, targetW, targetH);
                const pct = Math.max(0, Math.min(100, Number(splitRange.value)));
                splitPct.textContent = `${pct}%`;
                const splitX = Math.round((targetW * pct) / 100);
                // Left side: Original Pixel (Nearest)
                if (splitX > 0) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(0, 0, splitX, targetH);
                    ctx.clip();
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(origImg, 0, 0, targetW, targetH);
                    ctx.restore();
                }
                // Right side: Phase 2 Remastered HD
                if (splitX < targetW) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(splitX, 0, targetW - splitX, targetH);
                    ctx.clip();
                    ctx.imageSmoothingEnabled = true;
                    ctx.drawImage(remImg, 0, 0, targetW, targetH);
                    ctx.restore();
                }
                // Divider line & labels
                ctx.strokeStyle = '#d4a853';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(splitX, 0);
                ctx.lineTo(splitX, targetH);
                ctx.stroke();
                ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
                ctx.fillRect(8, 8, 92, 22);
                ctx.fillRect(Math.max(8, targetW - 118), 8, 110, 22);
                ctx.font = 'bold 11px sans-serif';
                ctx.fillStyle = '#e8edf5';
                ctx.fillText('원본 (Pixel)', 14, 23);
                ctx.fillStyle = '#f2cf7e';
                ctx.fillText('✨ 리마스터 HD', Math.max(14, targetW - 112), 23);
                uiInfo.textContent = `A/B 비교 · 원본 ${origImg.width}×${origImg.height} vs 리마스터 ${remImg.width}×${remImg.height} → 출력 ${targetW}×${targetH}`;
            }
            else {
                splitBar.style.display = 'none';
                const img = await loadImage(screenSel.value, ASSET_BASE);
                const w = img.width * scale;
                const h = img.height * scale;
                drawWithFilter(uiCanvas.getContext('2d'), img, mode, w, h);
                uiInfo.textContent = `원본 ${img.width}×${img.height} → 출력 ${w}×${h} (${mode})`;
            }
        };
        screenSel.addEventListener('change', redrawUi);
        filterSel.addEventListener('change', redrawUi);
        scaleSel.addEventListener('change', redrawUi);
        splitRange.addEventListener('input', redrawUi);
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
        const sourceSel = document.getElementById('sceneSourceSelect');
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
        const getBase = () => (sourceSel && sourceSel.value === 'extracted' ? ASSET_BASE : REMASTER_BASE);
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
            const base = getBase();
            const isHd = base === REMASTER_BASE;
            const entry = this.catalog.cutscenes[key];
            if (!entry)
                return;
            speedInput.value = String(entry.frame_ms || 120);
            const outW = isHd && entry.width <= 320 ? entry.width * 2 : entry.width;
            const outH = isHd && entry.height <= 200 ? entry.height * 2 : entry.height;
            metaBox.innerHTML =
                `<strong>${key.toUpperCase()}</strong> [${isHd ? '✨ 리마스터 HD' : '원본 DOS'}] · 해상도: ${outW}×${outH} · 총 프레임: ${entry.frames.length}`;
            if (entry.gif) {
                gifPreview.src = base + entry.gif;
                gifPreview.style.display = 'block';
            }
            else {
                gifPreview.style.display = 'none';
            }
            const bgm = bgmMap[key] || 'audio/adlib/tit_theme.wav';
            audio.src = base + bgm;
            bgmLabel.textContent = (isHd ? '✨ 리마스터 Chorus/Hall BGM: ' : '원본 AdLib BGM: ') + bgm.split('/').pop();
            frameLabel.textContent = '프레임 로딩 중...';
            // Progressive load first frame immediately then remaining
            this.sceneFrames = [];
            const firstImg = await loadImage(entry.frames[0], base);
            this.sceneFrames = new Array(entry.frames.length).fill(firstImg);
            scrubber.max = String(Math.max(0, entry.frames.length - 1));
            renderFrame(0);
            Promise.all(entry.frames.map((p) => loadImage(p, base))).then((imgs) => {
                if (sel.value === key && getBase() === base) {
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
        sourceSel === null || sourceSel === void 0 ? void 0 : sourceSel.addEventListener('change', loadScene);
        loadScene();
    }
    // -------------------------------------------------------------------------
    // Tab 3: Faces
    // -------------------------------------------------------------------------
    renderFaces() {
        const grid = document.getElementById('facesGrid');
        const search = document.getElementById('faceSearch');
        const gridToggle = document.getElementById('facesGridToggle');
        const remLabel = document.getElementById('faceRemasterLabel');
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
            const [origImg, hdImg] = await Promise.all([
                loadImage(`faces/face_${pad}.png`, ASSET_BASE),
                loadImage(`faces/face_${pad}.png`, REMASTER_BASE),
            ]);
            drawWithFilter(origC.getContext('2d'), origImg, 'nearest', 50, 50);
            drawWithFilter(nearC.getContext('2d'), origImg, 'nearest', 200, 200);
            drawWithFilter(smoothC.getContext('2d'), hdImg, 'smooth', 200, 200);
            if (remLabel)
                remLabel.textContent = 'Phase 2 리마스터 HD (200×200 EPX)';
            Array.from(grid.children).forEach((el) => {
                el.classList.toggle('active', Number(el.dataset.id) === idx);
            });
        };
        const populate = (filterStr) => {
            const f = filterStr.trim();
            const base = gridToggle && gridToggle.value === 'extracted' ? ASSET_BASE : REMASTER_BASE;
            const items = [];
            for (let i = 0; i < count; i++) {
                const pad = String(i).padStart(3, '0');
                if (f && !pad.includes(f) && !String(i).includes(f))
                    continue;
                items.push(`<div class="face-item ${i === selectedId ? 'active' : ''}" data-id="${i}">
            <img src="${base}faces/face_${pad}.png" alt="#${pad}" loading="lazy" />
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
        gridToggle === null || gridToggle === void 0 ? void 0 : gridToggle.addEventListener('change', () => populate(search.value));
        populate('');
        selectFace(0);
    }
    // -------------------------------------------------------------------------
    // Tab 4: World Maps & Chapter Sprites
    // -------------------------------------------------------------------------
    setupWorld() {
        const chSel = document.getElementById('chapterSelect');
        const modeToggle = document.getElementById('worldRemasterToggle');
        const chStats = document.getElementById('chapterStats');
        const mapLabel = document.getElementById('mapChLabel');
        const mapResLabel = document.getElementById('mapResLabel');
        const mapCanvas = document.getElementById('mapCanvas');
        const worldMetaBox = document.getElementById('worldMetaBox');
        const sheetCanvas = document.getElementById('sheetCanvas');
        const sprOrigCanvas = document.getElementById('spriteOrigCanvas');
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
            const origSp = this.origChapterSprites[this.currentSprIdx] || sp;
            const hdSp = this.hdChapterSprites[this.currentSprIdx] || sp;
            sprIdxLabel.textContent = `${this.currentSprIdx + 1} / ${this.currentChapterSprites.length}`;
            if (sprOrigCanvas && this.origSheetImg) {
                const octx = sprOrigCanvas.getContext('2d');
                octx.clearRect(0, 0, sprOrigCanvas.width, sprOrigCanvas.height);
                octx.imageSmoothingEnabled = false;
                const oScale = Math.max(1, Math.min(3, Math.floor((sprOrigCanvas.width - 16) / Math.max(1, origSp.w, origSp.h))));
                const odw = origSp.w * oScale;
                const odh = origSp.h * oScale;
                const odx = Math.floor((sprOrigCanvas.width - odw) / 2);
                const ody = Math.floor((sprOrigCanvas.height - odh) / 2);
                octx.drawImage(this.origSheetImg, origSp.sx, origSp.sy, origSp.w, origSp.h, odx, ody, odw, odh);
            }
            const hdImg = this.remSheetImg || this.currentSheetImg;
            const zctx = zoomCanvas.getContext('2d');
            zctx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
            zctx.imageSmoothingEnabled = false;
            const zScale = Math.max(1, Math.min(3, Math.floor((zoomCanvas.width - 16) / Math.max(1, hdSp.w, hdSp.h))));
            const dw = hdSp.w * zScale;
            const dh = hdSp.h * zScale;
            const dx = Math.floor((zoomCanvas.width - dw) / 2);
            const dy = Math.floor((zoomCanvas.height - dh) / 2);
            zctx.drawImage(hdImg, hdSp.sx, hdSp.sy, hdSp.w, hdSp.h, dx, dy, dw, dh);
            detailMeta.innerHTML =
                `<div><strong>Entry ID:</strong> #${origSp.id}</div>` +
                    `<div><strong>원본:</strong> ${origSp.w}×${origSp.h} px → <strong>2x EPX HD:</strong> ${hdSp.w}×${hdSp.h} px</div>` +
                    `<div><strong>원본 VGA 오프셋:</strong> (${origSp.orig_x}, ${origSp.orig_y})</div>` +
                    `<div><strong>활성 시트 좌표:</strong> (${sp.sx}, ${sp.sy})</div>`;
            // Highlight selected box on sheet
            const sctx = sheetCanvas.getContext('2d');
            sctx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
            sctx.drawImage(this.currentSheetImg, 0, 0);
            sctx.strokeStyle = '#d4a853';
            sctx.lineWidth = Math.max(2, Math.round(sheetCanvas.width / 400));
            sctx.strokeRect(sp.sx - 1, sp.sy - 1, sp.w + 2, sp.h + 2);
        };
        const loadChapter = async (ch) => {
            stopSprAnim();
            mapLabel.textContent = String(ch);
            const isHd = !modeToggle || modeToggle.value === 'remastered';
            const mapInfo = this.catalog.world.maps[ch];
            const stkInfo = this.catalog.world.stk[ch];
            const sprCh = this.spritesIndex.chapters[ch];
            const hdCh = (this.spritesIndexHd && this.spritesIndexHd.chapters[ch]) || sprCh;
            chStats.textContent = `타일 종류 ${mapInfo.unique_tile_ids} · 비영점 셀 ${mapInfo.non_zero_cells}/16,384 · STK ${stkInfo.non_zero}B`;
            if (mapResLabel) {
                mapResLabel.textContent = isHd ? '512×512 리마스터 (4x EPX)' : '128×128 원본';
            }
            worldMetaBox.innerHTML =
                `<strong>MAP.${ch}</strong> (${isHd ? '512×512 EPX HD' : '128×128 원본'}) · 고유 타일 ID: ${mapInfo.unique_tile_ids}개<br>` +
                    `<strong>STK.${ch}</strong>: ${stkInfo.bytes.toLocaleString()}B (활성 ${stkInfo.non_zero.toLocaleString()}B)<br>` +
                    `<strong>공통:</strong> REGION (${this.catalog.world.region.rows}×${this.catalog.world.region.stride}) · SEED.TBL (${this.catalog.world.seed_tbl_decompressed_bytes}B)`;
            const [mapImg, origSheet, hdSheet] = await Promise.all([
                loadImage(mapInfo.image, isHd ? REMASTER_BASE : ASSET_BASE),
                loadImage(sprCh.sheet, ASSET_BASE),
                this.spritesIndexHd ? loadImage(hdCh.sheet, REMASTER_BASE).catch(() => null) : Promise.resolve(null),
            ]);
            drawWithFilter(mapCanvas.getContext('2d'), mapImg, isHd ? 'smooth' : 'nearest', 384, 384);
            this.origSheetImg = origSheet;
            this.remSheetImg = hdSheet || origSheet;
            this.origChapterSprites = sprCh.sprites;
            this.hdChapterSprites = hdSheet ? hdCh.sprites : sprCh.sprites;
            this.currentSheetImg = isHd ? this.remSheetImg : this.origSheetImg;
            this.currentChapterSprites = isHd ? this.hdChapterSprites : this.origChapterSprites;
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
        modeToggle === null || modeToggle === void 0 ? void 0 : modeToggle.addEventListener('change', () => loadChapter(Number(chSel.value)));
        loadChapter(0);
    }
    // -------------------------------------------------------------------------
    // Tab 5: Audio Studio (AdLib OPL2 + PCM VOC)
    // -------------------------------------------------------------------------
    setupAudio() {
        const player = document.getElementById('mainAudioPlayer');
        const nowPlaying = document.getElementById('audioNowPlaying');
        const rateSel = document.getElementById('vocRateSelect');
        const vocToggle = document.getElementById('vocRemasterToggle');
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
        const playTrack = (relPath, label, isVoc, base = REMASTER_BASE) => {
            ensureAnalyser();
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume().catch(() => { });
            }
            player.src = base + relPath;
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
              <button class="btn play-adlib" data-base="extracted" data-src="${t.wav}" data-label="[원본 AdLib] ${t.title}">▶ 원본</button>
              <button class="btn primary play-adlib" data-base="remastered" data-src="${t.wav}" data-label="[✨ HD AdLib] ${t.title}">✨ HD</button>
              <a class="btn" href="${ASSET_BASE}${t.midi}" download>MIDI</a>
            </div>
          </div>`)
            .join('');
        adlibList.addEventListener('click', (e) => {
            const btn = e.target.closest('.play-adlib');
            if (btn && btn.dataset.src) {
                const base = btn.dataset.base === 'extracted' ? ASSET_BASE : REMASTER_BASE;
                playTrack(btn.dataset.src, btn.dataset.label || btn.dataset.src, false, base);
            }
        });
        const renderVocList = () => {
            const bank = bankFilter.value;
            const defaultHd = !vocToggle || vocToggle.value === 'remastered';
            const filtered = this.catalog.audio.voc.filter((v) => bank === 'ALL' || v.bank === bank);
            vocList.innerHTML = filtered
                .map((v) => `<div class="list-row clickable voc-row" data-src="${v.file}" data-id="${v.id}">
              <div>
                <span class="badge">${v.bank}</span>
                ${defaultHd ? '<span class="badge gold">22kHz HD</span>' : '<span class="badge">8kHz 원본</span>'}
                <strong>${v.id}</strong>
                <span class="hint">(${v.bytes.toLocaleString()}B · ${v.duration_sec}s)</span>
              </div>
              <div class="controls-inline">
                <button class="btn play-voc-btn" data-base="extracted" data-src="${v.file}" data-label="[원본 VOC] ${v.id}">▶ 원본</button>
                <button class="btn primary play-voc-btn" data-base="remastered" data-src="${v.file}" data-label="[✨ HD VOC] ${v.id}">✨ HD</button>
              </div>
            </div>`)
                .join('');
        };
        vocList.addEventListener('click', (e) => {
            const btn = e.target.closest('.play-voc-btn');
            if (btn && btn.dataset.src) {
                const base = btn.dataset.base === 'extracted' ? ASSET_BASE : REMASTER_BASE;
                playTrack(btn.dataset.src, btn.dataset.label || btn.dataset.src, true, base);
                return;
            }
            const row = e.target.closest('.voc-row');
            if (row && row.dataset.src) {
                const isHd = !vocToggle || vocToggle.value === 'remastered';
                const base = isHd ? REMASTER_BASE : ASSET_BASE;
                const prefix = isHd ? '[✨ HD VOC]' : '[원본 VOC]';
                playTrack(row.dataset.src, `${prefix} ${row.dataset.id || row.dataset.src}`, true, base);
            }
        });
        bankFilter.addEventListener('change', renderVocList);
        vocToggle === null || vocToggle === void 0 ? void 0 : vocToggle.addEventListener('change', renderVocList);
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
        const kfontSheetImg = document.getElementById('kfontSheetImg');
        const kfontSheetLabel = document.getElementById('kfontSheetLabel');
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
            const mode = modeSel.value;
            const isPhase2 = mode === 'phase2';
            const isRemaster = mode === 'remaster' || isPhase2;
            if (kfontSheetImg) {
                const hdSrc = `${REMASTER_BASE}fonts/kfont_15_hangul_hd.png`;
                const origSrc = `${ASSET_BASE}fonts/kfont_15_hangul.png`;
                const want = mode === 'dos' || mode === 'pixel' ? origSrc : hdSrc;
                if (!kfontSheetImg.src.endsWith(want))
                    kfontSheetImg.src = want;
            }
            if (kfontSheetLabel) {
                kfontSheetLabel.textContent =
                    mode === 'dos' || mode === 'pixel'
                        ? '원본 KFONT.15 한글 2,350자 전체 시트:'
                        : 'Phase 2 KFONT.15 EPX 2x 리마스터 시트 미리보기:';
            }
            let cursorX = 12;
            let cursorY = 14;
            const maxW = w - 20;
            const decodeBitmap = (hex, cols) => {
                const grid = [];
                const bytesPerRow = cols === 16 ? 2 : 1;
                for (let r = 0; r < 16; r++) {
                    const rowHex = hex.slice(r * bytesPerRow * 2, (r + 1) * bytesPerRow * 2);
                    const val = parseInt(rowHex, 16) || 0;
                    const row = [];
                    for (let c = 0; c < cols; c++) {
                        row.push((val >> (cols - 1 - c)) & 1);
                    }
                    grid.push(row);
                }
                return grid;
            };
            const drawGlyphBits = (hex, cols, gx, gy, fill) => {
                ctx.fillStyle = fill;
                const grid = decodeBitmap(hex, cols);
                if (!isPhase2) {
                    for (let r = 0; r < 16; r++) {
                        for (let c = 0; c < cols; c++) {
                            if (grid[r][c]) {
                                ctx.fillRect(gx + c * scale, gy + r * scale, scale, scale);
                            }
                        }
                    }
                    return;
                }
                // Binary EPX / Scale2x curve smoothing on 2x subpixel grid (1px per subpixel = same 16*2=32px size)
                const at = (rr, cc) => rr >= 0 && rr < 16 && cc >= 0 && cc < cols ? grid[rr][cc] : 0;
                for (let r = 0; r < 16; r++) {
                    for (let c = 0; c < cols; c++) {
                        const p = at(r, c);
                        const a = at(r - 1, c);
                        const b = at(r, c + 1);
                        const cl = at(r, c - 1);
                        const d = at(r + 1, c);
                        const e0 = cl === a && cl !== d && a !== b ? a : p;
                        const e1 = a === b && a !== cl && b !== d ? b : p;
                        const e2 = d === cl && d !== b && cl !== a ? cl : p;
                        const e3 = b === d && b !== a && d !== cl ? d : p;
                        if (e0)
                            ctx.fillRect(gx + c * 2, gy + r * 2, 1, 1);
                        if (e1)
                            ctx.fillRect(gx + c * 2 + 1, gy + r * 2, 1, 1);
                        if (e2)
                            ctx.fillRect(gx + c * 2, gy + r * 2 + 1, 1, 1);
                        if (e3)
                            ctx.fillRect(gx + c * 2 + 1, gy + r * 2 + 1, 1, 1);
                    }
                }
            };
            const makeFill = (gy) => {
                if (!isPhase2)
                    return isRemaster ? '#ffe9b8' : '#f2e0b2';
                const grad = ctx.createLinearGradient(0, gy, 0, gy + 16 * scale);
                grad.addColorStop(0, '#fff4cf');
                grad.addColorStop(0.5, '#f4d078');
                grad.addColorStop(1, '#cf9435');
                return grad;
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
                        drawGlyphBits(glyphHex, 8, cursorX + 2, cursorY + 2, isPhase2 ? '#1a0c0c' : '#111622');
                    }
                    drawGlyphBits(glyphHex, 8, cursorX, cursorY, isPhase2 ? makeFill(cursorY) : isRemaster ? '#ffe9b8' : '#e6d2a0');
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
                            drawGlyphBits(glyphHex, 16, cursorX + 2, cursorY + 2, isPhase2 ? '#240d0d' : '#2b1212');
                        }
                        drawGlyphBits(glyphHex, 16, cursorX, cursorY, makeFill(cursorY));
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
