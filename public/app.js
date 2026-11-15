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
function renderKfontBitmapCanvas(canvas, text, mode, fontBitmaps, scale = 2, bgColor = '#07090e') {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
    const isPhase2 = mode === 'phase2';
    const isRemaster = mode === 'remaster' || isPhase2;
    const lineStep = 18 * scale;
    let cursorX = 10;
    let cursorY = 10;
    const maxW = w - 16;
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
        if (!isPhase2 || scale !== 2) {
            for (let r = 0; r < 16; r++) {
                for (let c = 0; c < cols; c++) {
                    if (grid[r][c]) {
                        ctx.fillRect(gx + c * scale, gy + r * scale, scale, scale);
                    }
                }
            }
            return;
        }
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
            cursorX = 10;
            cursorY += lineStep;
            continue;
        }
        const code = ch.charCodeAt(0);
        if (code < 128) {
            const glyphHex = fontBitmaps.ascii_8x16[code] || fontBitmaps.ascii_8x16[32];
            if (cursorX + 8 * scale > maxW) {
                cursorX = 10;
                cursorY += lineStep;
            }
            if (cursorY + 16 * scale > h)
                break;
            if (isRemaster) {
                drawGlyphBits(glyphHex, 8, cursorX + 2, cursorY + 2, isPhase2 ? '#1a0c0c' : '#111622');
            }
            drawGlyphBits(glyphHex, 8, cursorX, cursorY, isPhase2 ? makeFill(cursorY) : isRemaster ? '#ffe9b8' : '#e6d2a0');
            cursorX += 9 * scale;
        }
        else {
            const glyphHex = fontBitmaps.hangul_16x16[ch];
            if (cursorX + 16 * scale > maxW) {
                cursorX = 10;
                cursorY += lineStep;
            }
            if (cursorY + 16 * scale > h)
                break;
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
        // Phase 3 Core Engine state
        this.worldData = null;
        this.gameSheetOrigCache = new Map();
        this.gameSheetHdCache = new Map();
        this.gameMapCache = new Map();
        this.gameBgmAudio = null;
        this.gameIntroAudio = null;
        this.gameOnModeChange = null;
    }
    isGlobalHdMode() {
        const btn = document.getElementById('globalModeToggle');
        return !btn || btn.dataset.mode === 'remastered';
    }
    async init() {
        var _a, _b;
        const isMobilePlay = document.body.dataset.mode === 'mobile-play';
        if (!isMobilePlay) {
            this.setupTabs();
        }
        const statusPill = document.getElementById('statusPill');
        try {
            if (isMobilePlay) {
                const [cat, spr, sprHd, fnt, world] = await Promise.all([
                    fetchJson('catalog.json'),
                    fetchJson('events/sprites_index.json'),
                    fetchJson('events/sprites_index_hd.json', REMASTER_BASE).catch(() => null),
                    fetchJson('fonts/font_bitmaps.json'),
                    fetchJson('world/chapters_data.json').catch(() => null),
                ]);
                this.catalog = cat;
                this.spritesIndex = spr;
                this.spritesIndexHd = sprHd;
                this.fontBitmaps = fnt;
                this.worldData = world;
                const chCount = world ? world.active_chapters.length : 0;
                const artCount = ((_a = world === null || world === void 0 ? void 0 : world.martial_arts) === null || _a === void 0 ? void 0 : _a.length) || 5;
                statusPill.textContent = `실전 플레이 모바일 (${chCount}챕터 · ${artCount}대무공)`;
                this.setupGameEngine();
                this.setupGlobalModeToggle();
                this.setupMobilePwa();
                return;
            }
            const [cat, pal, spr, sprHd, dlg, fnt, world] = await Promise.all([
                fetchJson('catalog.json'),
                fetchJson('ui/palette.json'),
                fetchJson('events/sprites_index.json'),
                fetchJson('events/sprites_index_hd.json', REMASTER_BASE).catch(() => null),
                fetchJson('events/dialogues_ko.json'),
                fetchJson('fonts/font_bitmaps.json'),
                fetchJson('world/chapters_data.json').catch(() => null),
            ]);
            this.catalog = cat;
            this.palettes = pal;
            this.spritesIndex = spr;
            this.spritesIndexHd = sprHd;
            this.dialogues = dlg;
            this.fontBitmaps = fnt;
            this.worldData = world;
            const chCount = world ? world.active_chapters.length : 0;
            const artCount = ((_b = world === null || world === void 0 ? void 0 : world.martial_arts) === null || _b === void 0 ? void 0 : _b.length) || 5;
            const endCount = (world === null || world === void 0 ? void 0 : world.endings) ? Object.keys(world.endings).length : 4;
            statusPill.textContent =
                `Phase 4 완결판(${chCount}챕터·${artCount}대무공·${endCount}엔딩) · 인물 ${cat.faces.count} (4x EPX) · 스프라이트 ${cat.events.total_sprites} (2x EPX)`;
            this.setupGameEngine();
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
    setupMobilePwa() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch((err) => {
                console.warn('SW registration skipped:', err);
            });
        }
        const installBtn = document.getElementById('pwaInstallBtn');
        let deferredPrompt = null;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            if (installBtn) {
                installBtn.classList.remove('hidden');
            }
        });
        if (installBtn) {
            installBtn.addEventListener('click', async () => {
                if (!deferredPrompt)
                    return;
                await deferredPrompt.prompt();
                await deferredPrompt.userChoice;
                deferredPrompt = null;
                installBtn.classList.add('hidden');
            });
        }
        const offlineBtn = document.getElementById('pwaOfflineBtn');
        if (offlineBtn && 'caches' in window) {
            offlineBtn.addEventListener('click', async () => {
                if (offlineBtn.disabled)
                    return;
                offlineBtn.disabled = true;
                const urls = new Set();
                const isHd = this.isGlobalHdMode();
                const base = isHd ? REMASTER_BASE : ASSET_BASE;
                if (this.worldData) {
                    for (const chId of this.worldData.active_chapters) {
                        urls.add(`${ASSET_BASE}/world/ch${chId}_map.bin`);
                        if (isHd)
                            urls.add(`${REMASTER_BASE}/events/ch${chId}_sheet_hd.png`);
                        urls.add(`${ASSET_BASE}/events/ch${chId}_sheet.png`);
                    }
                }
                if (this.catalog) {
                    urls.add(`${base}/${this.catalog.faces.sheet}`);
                    for (let i = 0; i < this.catalog.faces.count; i += 1) {
                        urls.add(`${base}/faces/face_${String(i).padStart(3, '0')}.png`);
                    }
                    for (const csKey of Object.keys(this.catalog.cutscenes)) {
                        const cs = this.catalog.cutscenes[csKey];
                        for (const fr of cs.frames) {
                            urls.add(`${base}/${fr}`);
                        }
                    }
                    for (const v of this.catalog.audio.voc) {
                        urls.add(`${base}/${v.file}`);
                    }
                    for (const b of this.catalog.audio.adlib) {
                        urls.add(`${base}/${b.wav}`);
                    }
                }
                const list = Array.from(urls);
                let done = 0;
                try {
                    const cache = await caches.open('swordsman-play-v1');
                    const batchSize = 8;
                    for (let i = 0; i < list.length; i += batchSize) {
                        const slice = list.slice(i, i + batchSize);
                        await Promise.all(slice.map(async (u) => {
                            try {
                                const hit = await cache.match(u);
                                if (!hit) {
                                    const res = await fetch(u);
                                    if (res.ok)
                                        await cache.put(u, res);
                                }
                            }
                            catch {
                                // skip unavailable optional asset
                            }
                            finally {
                                done += 1;
                            }
                        }));
                        offlineBtn.textContent = `📥 오프라인 ${done}/${list.length}`;
                    }
                    offlineBtn.textContent = `✅ 오프라인 준비됨 (${done})`;
                }
                catch {
                    offlineBtn.textContent = '⚠ 오프라인 캐시 실패';
                }
                finally {
                    offlineBtn.disabled = false;
                }
            });
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
            if (this.gameOnModeChange) {
                this.gameOnModeChange();
            }
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
            const text = kfontInput.value || '';
            const mode = modeSel.value;
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
            renderKfontBitmapCanvas(kfontCanvas, text, mode, this.fontBitmaps, 2, '#07090e');
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
    // -------------------------------------------------------------------------
    // Tab 0: Playable Core Engine (Phase 3)
    // -------------------------------------------------------------------------
    setupGameEngine() {
        var _a;
        const world = this.worldData;
        const canvas = document.getElementById('gameCanvas');
        if (!world || !canvas)
            return;
        const chSel = document.getElementById('gameChapterSelect');
        const evSel = document.getElementById('gameEventSelect');
        const runEvBtn = document.getElementById('gameRunEventBtn');
        const interactBtn = document.getElementById('gameInteractBtn');
        const attackBtn = document.getElementById('gameAttackBtn');
        const introBtn = document.getElementById('gameIntroBtn');
        const skipIntroBtn = document.getElementById('gameSkipIntroBtn');
        const bgmBtn = document.getElementById('gameBgmToggle');
        const aiChk = document.getElementById('gameAiToggle');
        const noClipChk = document.getElementById('gameNoClipToggle');
        const saveSlotSel = document.getElementById('gameSaveSlotSelect');
        const saveBtn = document.getElementById('gameSaveBtn');
        const loadBtn = document.getElementById('gameLoadBtn');
        const endingSel = document.getElementById('gameEndingSelect');
        const endingBtn = document.getElementById('gameEndingBtn');
        const skillBar = document.getElementById('gameSkillBar');
        const minimapCanvas = document.getElementById('gameMinimapCanvas');
        const minimapCoords = document.getElementById('gameMinimapCoords');
        const minimapCtx = minimapCanvas.getContext('2d');
        const coordBadge = document.getElementById('gameCoordBadge');
        const renderBadge = document.getElementById('gameRenderBadge');
        const swordBadge = document.getElementById('gameSwordBadge');
        const statusBox = document.getElementById('gameStatusBox');
        const invList = document.getElementById('gameInventoryList');
        const objCountBadge = document.getElementById('gameObjCountBadge');
        const objList = document.getElementById('gameObjList');
        const logList = document.getElementById('gameLogList');
        const dlgBox = document.getElementById('gameDialogueBox');
        const dlgPortrait = document.getElementById('gameDlgPortrait');
        const dlgSpeaker = document.getElementById('gameDlgSpeaker');
        const dlgStepInfo = document.getElementById('gameDlgStepInfo');
        const dlgText = document.getElementById('gameDlgText');
        const dlgKfont = document.getElementById('gameDlgKfont');
        const dlgNextBtn = document.getElementById('gameDlgNextBtn');
        const dlgCloseBtn = document.getElementById('gameDlgCloseBtn');
        const SCALE = 2;
        const ctx = canvas.getContext('2d');
        // Build O(1) per-chapter sprite rect maps
        const spriteMaps = new Map();
        for (const c of this.spritesIndex.chapters) {
            const origMap = new Map();
            for (const s of c.sprites)
                origMap.set(s.id, s);
            const hdCh = (_a = this.spritesIndexHd) === null || _a === void 0 ? void 0 : _a.chapters.find((h) => h.chapter === c.chapter);
            const hdMap = new Map();
            if (hdCh) {
                for (const s of hdCh.sprites)
                    hdMap.set(s.id, s);
            }
            spriteMaps.set(c.chapter, { orig: origMap, hd: hdMap });
        }
        const activeChapters = world.chapters.filter((c) => c.active);
        chSel.innerHTML = activeChapters
            .map((c) => `<option value="${c.chapter}">${c.title}</option>`)
            .join('');
        const defaultArts = [
            { id: 'huashan', key: '1', name: '화산검법', mp_cost: 0, damage: 55, range: 3.2, proj: false, aoe: false, heal_hp: 0, heal_mp: 0, color: '#ffe082', desc: '근접 검술' },
            { id: 'dugu', key: '2', name: '독고구검', mp_cost: 15, damage: 95, range: 7.5, proj: true, aoe: false, heal_hp: 0, heal_mp: 0, color: '#4dd0e1', desc: '관통 검기' },
            { id: 'bixie', key: '3', name: '벽사검법', mp_cost: 22, damage: 135, range: 6.5, proj: true, aoe: false, heal_hp: 0, heal_mp: 0, color: '#ff6e80', desc: '고속 검강' },
            { id: 'xixing', key: '4', name: '흡성대법', mp_cost: 30, damage: 110, range: 5.0, proj: false, aoe: true, heal_hp: 0, heal_mp: 0, color: '#b388ff', desc: '광역 흡수' },
            { id: 'zixia', key: '5', name: '자하진기', mp_cost: 25, damage: 0, range: 0, proj: false, aoe: false, heal_hp: 90, heal_mp: 0, color: '#69f0ae', desc: '체력 회복' },
        ];
        const martialArts = world.martial_arts && world.martial_arts.length > 0 ? world.martial_arts : defaultArts;
        let activeSkillIdx = 0;
        const chapterStates = new Map();
        const minimapBgCache = new Map();
        const projectiles = [];
        const floatingTexts = [];
        const pulseRings = [];
        const inventory = new Map([
            [0, { id: 0, name: '은전', qty: 100 }],
            [5, { id: 5, name: '금창약', qty: 2 }],
        ]);
        const logs = [];
        let curChapter = activeChapters[0] || world.chapters[0];
        let curGrid = new Uint8Array(128 * 128);
        let chapterEnteredAt = performance.now();
        const player = {
            x: curChapter.spawn.x,
            y: curChapter.spawn.y,
            hp: curChapter.spawn.hp,
            maxHp: curChapter.spawn.max_hp,
            mp: curChapter.spawn.mp,
            maxMp: Math.max(200, curChapter.spawn.mp),
            dir: curChapter.spawn.dir || 2,
            swordName: '화산검법',
            swordPower: 55,
            exp: 0,
            state: 'idle',
            stateTimer: 0,
            animTick: 0,
            moveTarget: null,
            hazardCooldown: 0,
        };
        const camera = { x: player.x, y: player.y };
        let activeComd = null;
        let introPlaying = false;
        let introCancel = false;
        let introImg = null;
        let introCaption = '';
        const spawnFloating = (x, y, text, color) => {
            floatingTexts.push({ x, y, text, color, life: 0.95, maxLife: 0.95 });
        };
        const spawnPulse = (x, y, maxR, color) => {
            pulseRings.push({ x, y, maxR, color, life: 0.45, maxLife: 0.45 });
        };
        const renderSkillBar = () => {
            const skCur = martialArts[activeSkillIdx] || martialArts[0];
            if (skCur) {
                player.swordName = skCur.name;
                swordBadge.textContent = skCur.name;
            }
            skillBar.innerHTML = martialArts
                .map((sk, idx) => `<button type="button" class="skill-slot-btn${idx === activeSkillIdx ? ' active' : ''}" data-skill-idx="${idx}" title="${sk.desc}">
              <div class="skill-slot-top">
                <span style="color:${sk.color};">[${sk.key}] ${sk.name}</span>
                <span class="badge">MP ${sk.mp_cost}</span>
              </div>
              <div class="skill-slot-meta">${sk.heal_hp > 0 ? `체력 +${sk.heal_hp}` : sk.aoe ? `광역 ${sk.damage}` : sk.proj ? `장풍 ${sk.damage}` : `근접 ${sk.damage}`}</div>
            </button>`)
                .join('');
        };
        const pushLog = (msg) => {
            const chTag = `CH${curChapter.chapter}`;
            logs.unshift(`[${chTag}] ${msg}`);
            if (logs.length > 40)
                logs.pop();
            logList.innerHTML = logs
                .map((line) => `<div class="list-row" style="padding:5px 8px;font-size:0.78rem;">${line}</div>`)
                .join('');
        };
        const playVoc = (kind) => {
            var _a, _b;
            const clips = ((_b = (_a = this.catalog) === null || _a === void 0 ? void 0 : _a.audio) === null || _b === void 0 ? void 0 : _b.voc) || [];
            if (clips.length === 0)
                return;
            const idxMap = {
                sword: 0,
                hit: Math.min(2, clips.length - 1),
                chest: Math.min(4, clips.length - 1),
                talk: Math.min(6, clips.length - 1),
                tele: Math.min(8, clips.length - 1),
            };
            const clip = clips[idxMap[kind]];
            if (!clip)
                return;
            const base = this.isGlobalHdMode() ? REMASTER_BASE : ASSET_BASE;
            const a = new Audio(base + clip.file);
            a.volume = 0.42;
            a.play().catch(() => { });
        };
        const syncBgm = (forcePlay) => {
            var _a, _b, _c;
            const on = forcePlay !== undefined ? forcePlay : bgmBtn.dataset.bgm === 'on';
            bgmBtn.dataset.bgm = on ? 'on' : 'off';
            bgmBtn.textContent = on ? '🎵 BGM: ON' : '🎵 BGM: OFF';
            bgmBtn.classList.toggle('primary', on);
            if (!on) {
                (_a = this.gameBgmAudio) === null || _a === void 0 ? void 0 : _a.pause();
                return;
            }
            const tracks = ((_c = (_b = this.catalog) === null || _b === void 0 ? void 0 : _b.audio) === null || _c === void 0 ? void 0 : _c.adlib) || [];
            const bgmTrack = curChapter.chapter === 14
                ? tracks.find((t) => t.id === 'd9_theme') || tracks[0]
                : tracks[(curChapter.chapter + 2) % Math.max(1, tracks.length)];
            if (!bgmTrack)
                return;
            const base = this.isGlobalHdMode() ? REMASTER_BASE : ASSET_BASE;
            const src = base + bgmTrack.wav;
            if (!this.gameBgmAudio) {
                this.gameBgmAudio = new Audio();
                this.gameBgmAudio.loop = true;
                this.gameBgmAudio.volume = 0.35;
            }
            if (!this.gameBgmAudio.src.endsWith(src)) {
                this.gameBgmAudio.src = src;
            }
            this.gameBgmAudio.play().catch(() => { });
        };
        const getMapGrid = (ch) => {
            const cached = this.gameMapCache.get(ch.chapter);
            if (cached)
                return cached;
            const arr = new Uint8Array(ch.map_w * ch.map_h);
            if (ch.map_b64) {
                const bin = atob(ch.map_b64);
                const len = Math.min(arr.length, bin.length);
                for (let i = 0; i < len; i++)
                    arr[i] = bin.charCodeAt(i);
            }
            this.gameMapCache.set(ch.chapter, arr);
            return arr;
        };
        const ensureSheets = (ch) => {
            if (!this.gameSheetOrigCache.has(ch.chapter)) {
                loadImage(ch.sheet, ASSET_BASE)
                    .then((img) => {
                    this.gameSheetOrigCache.set(ch.chapter, img);
                })
                    .catch(() => { });
            }
            if (!this.gameSheetHdCache.has(ch.chapter)) {
                loadImage(ch.sheet, REMASTER_BASE)
                    .then((img) => {
                    this.gameSheetHdCache.set(ch.chapter, img);
                })
                    .catch(() => { });
            }
        };
        const worldToIso = (gx, gy) => ({
            ix: (gx - gy) * 16,
            iy: (gx + gy) * 8,
        });
        const isoToWorld = (ix, iy) => ({
            gx: (ix / 16 + iy / 8) * 0.5,
            gy: (iy / 8 - ix / 16) * 0.5,
        });
        const isWalkable = (nx, ny) => {
            if (nx < 0.5 || ny < 0.5 || nx >= curChapter.map_w - 0.5 || ny >= curChapter.map_h - 0.5) {
                return false;
            }
            if (noClipChk.checked)
                return true;
            const gx = Math.floor(nx);
            const gy = Math.floor(ny);
            const tid = curGrid[gy * curChapter.map_w + gx] || 0;
            const ter = curChapter.ter[tid];
            return !ter || ter.blocking === 0;
        };
        const getCurState = () => {
            let st = chapterStates.get(curChapter.chapter);
            if (!st) {
                st = {
                    chars: curChapter.chars.map((c) => ({
                        ...c,
                        alive: true,
                        hitFlash: 0,
                        aiCooldown: 0.7 + Math.random() * 0.6,
                    })),
                    objs: curChapter.objs.map((o) => ({
                        ...o,
                        opened: false,
                        unlocked: o.kind !== 'portal' || curChapter.chapter !== 0,
                    })),
                };
                chapterStates.set(curChapter.chapter, st);
            }
            return st;
        };
        const getMinimapBg = (ch, grid) => {
            const cached = minimapBgCache.get(ch.chapter);
            if (cached)
                return cached;
            const off = document.createElement('canvas');
            off.width = ch.map_w;
            off.height = ch.map_h;
            const octx = off.getContext('2d');
            const img = octx.createImageData(ch.map_w, ch.map_h);
            for (let i = 0; i < ch.map_w * ch.map_h; i++) {
                const tid = grid[i] || 0;
                const ter = ch.ter[tid];
                let r = 20;
                let g = 29;
                let b = 46;
                if (ter && ter.damage > 0) {
                    r = 140;
                    g = 46;
                    b = 54;
                }
                else if (ter && ter.blocking > 0) {
                    r = 66;
                    g = 82;
                    b = 110;
                }
                const p = i * 4;
                img.data[p] = r;
                img.data[p + 1] = g;
                img.data[p + 2] = b;
                img.data[p + 3] = 255;
            }
            octx.putImageData(img, 0, 0);
            minimapBgCache.set(ch.chapter, off);
            return off;
        };
        const renderMinimap = () => {
            const mw = minimapCanvas.width;
            const mh = minimapCanvas.height;
            const bg = getMinimapBg(curChapter, curGrid);
            minimapCtx.imageSmoothingEnabled = false;
            minimapCtx.clearRect(0, 0, mw, mh);
            minimapCtx.drawImage(bg, 0, 0, mw, mh);
            const sx = mw / curChapter.map_w;
            const sy = mh / curChapter.map_h;
            const st = getCurState();
            for (const obj of st.objs) {
                const ox = obj.x * sx;
                const oy = obj.y * sy;
                if (obj.kind === 'chest' && !obj.opened) {
                    minimapCtx.fillStyle = '#d4a853';
                    minimapCtx.fillRect(ox - 2, oy - 2, 4, 4);
                }
                else if (obj.kind === 'portal' || obj.kind === 'npc') {
                    minimapCtx.fillStyle = '#3da88e';
                    minimapCtx.fillRect(ox - 1.5, oy - 1.5, 3, 3);
                }
            }
            for (const ch of st.chars) {
                if (!ch.alive)
                    continue;
                minimapCtx.fillStyle = ch.is_boss ? '#ffca28' : '#f25252';
                minimapCtx.beginPath();
                minimapCtx.arc(ch.x * sx, ch.y * sy, ch.is_boss ? 3.2 : 2.2, 0, Math.PI * 2);
                minimapCtx.fill();
            }
            if (player.moveTarget) {
                minimapCtx.strokeStyle = 'rgba(77, 208, 225, 0.85)';
                minimapCtx.lineWidth = 1;
                minimapCtx.beginPath();
                minimapCtx.moveTo(player.x * sx, player.y * sy);
                minimapCtx.lineTo(player.moveTarget.x * sx, player.moveTarget.y * sy);
                minimapCtx.stroke();
            }
            const px = player.x * sx;
            const py = player.y * sy;
            minimapCtx.strokeStyle = '#fff4b8';
            minimapCtx.lineWidth = 1.5;
            minimapCtx.strokeRect(px - 3, py - 3, 6, 6);
            minimapCoords.textContent = `CH${curChapter.chapter} (${Math.round(player.x)},${Math.round(player.y)})`;
        };
        const updateStatusUi = () => {
            const hpPct = Math.max(0, Math.min(100, Math.round((player.hp / Math.max(1, player.maxHp)) * 100)));
            const mpPct = Math.max(0, Math.min(100, Math.round((player.mp / Math.max(1, player.maxMp)) * 100)));
            const activeSk = martialArts[activeSkillIdx] || martialArts[0];
            swordBadge.textContent = activeSk ? activeSk.name : player.swordName;
            statusBox.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>영호충 (令狐沖)</strong>
          <span class="mono">경험치 ${player.exp} · 공격력 ${player.swordPower}</span>
        </div>
        <div style="font-size:0.78rem;margin-top:6px;">체력 HP: ${player.hp} / ${player.maxHp}</div>
        <div class="hp-bar-track"><div class="hp-bar-fill" style="width:${hpPct}%"></div></div>
        <div style="font-size:0.78rem;">내공 MP: ${player.mp} / ${player.maxMp}</div>
        <div class="hp-bar-track" style="margin-bottom:2px;"><div class="mp-bar-fill" style="width:${mpPct}%"></div></div>
      `;
            const itemsArr = Array.from(inventory.values());
            invList.innerHTML = itemsArr
                .map((it) => `<div class="list-row clickable inv-row" data-item-id="${it.id}" style="padding:5px 8px;font-size:0.8rem;" title="클릭하여 사용/장착">
              <span>${it.name}</span>
              <span class="badge gold">×${it.qty}</span>
            </div>`)
                .join('');
        };
        const updateObjsUi = () => {
            const st = getCurState();
            const rows = [];
            for (const ch of st.chars) {
                if (!ch.alive)
                    continue;
                const dist = Math.hypot(ch.x - player.x, ch.y - player.y);
                const tag = ch.is_boss ? '<span class="badge gold">보스</span>' : '<span class="badge">적</span>';
                rows.push(`<div class="list-row clickable obj-row" data-type="char" data-slot="${ch.slot}">
            <div>${tag} ${ch.name} <span class="mono" style="color:var(--muted);">HP ${ch.hp}/${ch.max_hp}</span></div>
            <span class="mono">${dist.toFixed(1)}t</span>
          </div>`);
            }
            for (const obj of st.objs) {
                const dist = Math.hypot(obj.x - player.x, obj.y - player.y);
                const badgeText = obj.kind === 'chest'
                    ? obj.opened
                        ? '빈상자'
                        : '상자'
                    : obj.kind === 'portal'
                        ? '포탈'
                        : obj.kind === 'npc'
                            ? '인물'
                            : '이벤트';
                rows.push(`<div class="list-row clickable obj-row" data-type="obj" data-slot="${obj.slot}">
            <div><span class="badge">${badgeText}</span> ${obj.label}</div>
            <span class="mono">${dist.toFixed(1)}t</span>
          </div>`);
            }
            objCountBadge.textContent = String(st.chars.filter((c) => c.alive).length + st.objs.length);
            objList.innerHTML =
                rows.join('') || '<div class="hint" style="padding:8px;">배치된 인물/오브젝트 없음</div>';
        };
        const renderDlgStep = () => {
            var _a;
            if (!activeComd) {
                dlgBox.hidden = true;
                return;
            }
            const step = activeComd.saySteps[activeComd.sayCursor];
            if (!step) {
                const tp = activeComd.pendingTeleport;
                activeComd = null;
                dlgBox.hidden = true;
                if (tp)
                    executeTeleport(tp);
                return;
            }
            dlgBox.hidden = false;
            const fid = step.face_id !== undefined && step.face_id !== null ? step.face_id : (_a = activeComd.curFace) !== null && _a !== void 0 ? _a : 4;
            const pad = String(Math.max(0, Math.min(149, fid))).padStart(3, '0');
            const faceBase = this.isGlobalHdMode() ? REMASTER_BASE : ASSET_BASE;
            dlgPortrait.src = `${faceBase}faces/face_${pad}.png`;
            dlgSpeaker.textContent = step.speaker || activeComd.curSpeaker;
            dlgStepInfo.textContent = `${activeComd.comd.name} (${activeComd.sayCursor + 1}/${activeComd.saySteps.length})`;
            const txt = step.text || '';
            dlgText.textContent = txt;
            dlgNextBtn.textContent =
                activeComd.sayCursor + 1 < activeComd.saySteps.length
                    ? '다음 ▶'
                    : activeComd.pendingTeleport
                        ? '다음 지역 ▶'
                        : '완료 ✓';
            const kScale = txt.length > 26 || txt.includes('\n') ? 1 : 2;
            const kMode = this.isGlobalHdMode() ? 'phase2' : 'dos';
            renderKfontBitmapCanvas(dlgKfont, txt, kMode, this.fontBitmaps, kScale, '#080b11');
        };
        const useInventoryItem = (itemId) => {
            const entry = inventory.get(itemId);
            if (!entry || entry.qty <= 0)
                return;
            const isMedicine = ['대보환', '금창약', '웅담환', '대환단', '천향단속교'].some((m) => entry.name.includes(m));
            if (isMedicine) {
                entry.qty -= 1;
                if (entry.qty <= 0)
                    inventory.delete(itemId);
                player.hp = Math.min(player.maxHp, player.hp + 120);
                player.mp = Math.min(player.maxMp, player.mp + 80);
                playVoc('chest');
                spawnPulse(player.x, player.y, 1.8, '#69f0ae');
                spawnFloating(player.x, player.y, '+120 HP / +80 MP', '#69f0ae');
                pushLog(`소지품 사용: ${entry.name} (HP +120, MP +80 회복)`);
                updateStatusUi();
                return;
            }
            if (entry.name.includes('검법')) {
                const matchIdx = martialArts.findIndex((sk) => entry.name.includes(sk.name));
                if (matchIdx >= 0) {
                    activeSkillIdx = matchIdx;
                    renderSkillBar();
                }
                player.swordName = entry.name;
                player.swordPower = Math.max(player.swordPower, entry.name === '벽사검법' ? 95 : 75);
                pushLog(`비급 장착: [${entry.name}] (공격력 ${player.swordPower})`);
                updateStatusUi();
                return;
            }
            pushLog(`소지품 확인: ${entry.name} (×${entry.qty})`);
        };
        const addInventoryItem = (itemId, qty) => {
            if (itemId < 0 || itemId >= curChapter.items.length)
                return;
            const itemDef = curChapter.items[itemId];
            const existing = inventory.get(itemId);
            if (existing) {
                existing.qty += qty;
            }
            else {
                inventory.set(itemId, { id: itemId, name: itemDef.name, qty });
            }
            if (itemDef.name.includes('검법')) {
                player.swordName = itemDef.name;
                player.swordPower = Math.max(player.swordPower, itemDef.name === '벽사검법' ? 95 : 75);
                pushLog(`비급 습득! 기본 무공이 [${itemDef.name}] (공격력 ${player.swordPower})로 상승!`);
            }
            else if (['대보환', '금창약', '웅담환', '대환단', '천향단속교'].includes(itemDef.name)) {
                player.hp = Math.min(player.maxHp, player.hp + 120);
                player.mp = Math.min(player.maxMp, player.mp + 60);
            }
            updateStatusUi();
        };
        const executeTeleport = (step) => {
            const targetCh = step.target_chapter !== undefined && step.target_chapter !== null ? step.target_chapter : curChapter.chapter;
            const tx = typeof step.x === 'number' && step.x > 0 ? step.x : undefined;
            const ty = typeof step.y === 'number' && step.y > 0 ? step.y : undefined;
            playVoc('tele');
            pushLog(`이동: Chapter ${targetCh} (${tx !== null && tx !== void 0 ? tx : '기본'}${ty !== undefined ? `, ${ty}` : ''})`);
            loadChapter(targetCh, tx !== undefined && ty !== undefined ? { x: tx, y: ty } : undefined);
        };
        const runComd = (comdId) => {
            const comd = curChapter.comds[comdId];
            if (!comd)
                return;
            playVoc('talk');
            const st = getCurState();
            const saySteps = [];
            let curFace = 4;
            let curSpeaker = '영호충';
            let pendingTeleport = null;
            for (const step of comd.steps) {
                if (step.op === 'face' && step.face_id !== undefined && step.face_id !== null) {
                    curFace = step.face_id;
                    curSpeaker = step.speaker || `인물 #${curFace}`;
                }
                else if (step.op === 'say') {
                    saySteps.push(step);
                }
                else if (step.op === 'set_obj') {
                    if (step.obj_slot !== undefined && step.obj_slot !== null) {
                        const targetObj = st.objs.find((o) => o.slot === step.obj_slot);
                        if (targetObj) {
                            targetObj.unlocked = true;
                            pushLog(`[이벤트] ${targetObj.label} 활성화됨`);
                        }
                    }
                }
                else if (step.op === 'give_item' && typeof step.item_id === 'number') {
                    if (step.item_id >= 0 && step.item_id < curChapter.items.length) {
                        addInventoryItem(step.item_id, 1);
                        pushLog(`획득: ${curChapter.items[step.item_id].name}`);
                    }
                    else {
                        player.exp += step.item_id;
                        updateStatusUi();
                    }
                }
                else if (step.op === 'teleport') {
                    pendingTeleport = step;
                }
            }
            if (saySteps.length > 0) {
                activeComd = {
                    comd,
                    saySteps,
                    sayCursor: 0,
                    curFace,
                    curSpeaker,
                    pendingTeleport,
                };
                renderDlgStep();
                updateObjsUi();
                return;
            }
            if (pendingTeleport) {
                executeTeleport(pendingTeleport);
                return;
            }
            pushLog(`이벤트 실행: ${comd.name}`);
            updateObjsUi();
        };
        const interactWithObj = (obj) => {
            if (obj.kind === 'chest') {
                if (!obj.opened) {
                    obj.opened = true;
                    playVoc('chest');
                    const qty = Math.max(1, obj.item_qty || 1);
                    const itemDef = curChapter.items[obj.item_id];
                    addInventoryItem(obj.item_id, qty);
                    pushLog(`보물상자 획득: ${itemDef ? itemDef.name : `아이템 #${obj.item_id}`} ×${qty}`);
                    updateObjsUi();
                    return;
                }
                pushLog('상자는 이미 비어 있습니다.');
            }
            runComd(obj.comd_id);
        };
        const interactNearest = () => {
            if (activeComd) {
                activeComd.sayCursor += 1;
                renderDlgStep();
                return;
            }
            const st = getCurState();
            let bestObj = null;
            let bestDist = 3.6;
            for (const obj of st.objs) {
                const d = Math.hypot(obj.x - player.x, obj.y - player.y);
                if (d < bestDist) {
                    bestDist = d;
                    bestObj = obj;
                }
            }
            if (!bestObj) {
                pushLog('주변 3.6타일 이내에 상호작용할 대상이 없습니다. (목록에서 대상을 클릭해보세요)');
                return;
            }
            interactWithObj(bestObj);
        };
        const stopIntro = () => {
            var _a;
            introCancel = true;
            introPlaying = false;
            skipIntroBtn.hidden = true;
            (_a = this.gameIntroAudio) === null || _a === void 0 ? void 0 : _a.pause();
        };
        const playCutsceneSequence = async (frames, musicRel, logLabel) => {
            if (introPlaying) {
                stopIntro();
                await new Promise((res) => window.setTimeout(res, 40));
            }
            introPlaying = true;
            introCancel = false;
            skipIntroBtn.hidden = false;
            const base = this.isGlobalHdMode() ? REMASTER_BASE : ASSET_BASE;
            if (!this.gameIntroAudio) {
                this.gameIntroAudio = new Audio();
                this.gameIntroAudio.volume = 0.45;
            }
            this.gameIntroAudio.src = base + musicRel;
            this.gameIntroAudio.currentTime = 0;
            this.gameIntroAudio.play().catch(() => { });
            pushLog(logLabel);
            // Stream images in small chunks so even 36-frame endings start playing immediately
            const batchSize = 6;
            for (let start = 0; start < frames.length; start += batchSize) {
                if (introCancel)
                    break;
                const chunk = frames.slice(start, start + batchSize);
                const imgs = await Promise.all(chunk.map((item) => loadImage(item.path, base).catch(() => null)));
                for (let j = 0; j < chunk.length; j++) {
                    if (introCancel)
                        break;
                    introImg = imgs[j];
                    introCaption = chunk[j].caption;
                    await new Promise((res) => window.setTimeout(res, chunk[j].ms));
                }
            }
            stopIntro();
        };
        const startIntro = async () => {
            if (introPlaying) {
                stopIntro();
                return;
            }
            const seq = [
                ...world.intro.gt_screens.map((path, i) => ({
                    path,
                    ms: 1400,
                    caption: `SOFT-WORLD 1993 · INTRO ${i + 1}/2`,
                })),
                ...world.intro.tit_frames.map((path, i) => ({
                    path,
                    ms: 95,
                    caption: `소오강호 (동방불패 · SwordsMan) TITLE ${i + 1}/${world.intro.tit_frames.length}`,
                })),
            ];
            await playCutsceneSequence(seq, world.intro.tit_music, '오프닝 시퀀스 재생: GT 로고 → TIT 타이틀');
        };
        const startEnding = async (endingId) => {
            var _a, _b, _c, _d;
            const meta = (_a = world.endings) === null || _a === void 0 ? void 0 : _a[endingId];
            const catFrames = ((_d = (_c = (_b = this.catalog) === null || _b === void 0 ? void 0 : _b.cutscenes) === null || _c === void 0 ? void 0 : _c[endingId]) === null || _d === void 0 ? void 0 : _d.frames) || [];
            let rawFrames = (meta === null || meta === void 0 ? void 0 : meta.frames) && meta.frames.length > 0 ? meta.frames : catFrames;
            if (rawFrames.length > 36) {
                const sampled = [];
                for (let i = 0; i < 36; i++) {
                    const idx = Math.min(rawFrames.length - 1, Math.round((i * (rawFrames.length - 1)) / 35));
                    if (!sampled.includes(rawFrames[idx]))
                        sampled.push(rawFrames[idx]);
                }
                rawFrames = sampled;
            }
            if (rawFrames.length === 0) {
                pushLog(`엔딩 [${endingId}] 프레임을 찾을 수 없습니다.`);
                return;
            }
            const title = (meta === null || meta === void 0 ? void 0 : meta.title) || `엔딩 (${endingId.toUpperCase()})`;
            const caption = (meta === null || meta === void 0 ? void 0 : meta.caption) || '';
            const music = (meta === null || meta === void 0 ? void 0 : meta.music) || (endingId === 'd9' ? 'audio/adlib/d9_theme.wav' : 'audio/adlib/em1_theme.wav');
            endingSel.value = endingId;
            const seq = rawFrames.map((path, i) => ({
                path,
                ms: 170,
                caption: `${title} (${i + 1}/${rawFrames.length}) — ${caption}`,
            }));
            await playCutsceneSequence(seq, music, `멀티 엔딩 재생: ${title}`);
        };
        const loadChapter = (chNum, spawnOverride) => {
            const target = world.chapters.find((c) => c.chapter === chNum && c.active);
            if (!target)
                return;
            curChapter = target;
            curGrid = getMapGrid(curChapter);
            ensureSheets(curChapter);
            chapterEnteredAt = performance.now();
            player.x = spawnOverride ? spawnOverride.x : curChapter.spawn.x;
            player.y = spawnOverride ? spawnOverride.y : curChapter.spawn.y;
            player.moveTarget = null;
            projectiles.length = 0;
            pulseRings.length = 0;
            camera.x = player.x;
            camera.y = player.y;
            activeComd = null;
            dlgBox.hidden = true;
            chSel.value = String(curChapter.chapter);
            const runnableComds = curChapter.comds.filter((c) => c.steps.length > 0 || c.id >= 15);
            evSel.innerHTML = runnableComds
                .map((c) => `<option value="${c.id}">#${c.id} ${c.name}${c.steps.some((s) => s.op === 'say') ? ` (대사 ${c.steps.filter((s) => s.op === 'say').length})` : ''}</option>`)
                .join('');
            coordBadge.textContent = `CH${curChapter.chapter} · (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`;
            renderSkillBar();
            updateStatusUi();
            updateObjsUi();
            renderMinimap();
            syncBgm();
            pushLog(`${curChapter.title} 입장`);
        };
        const saveGameState = (slotKey) => {
            const chaptersSnapshot = [];
            chapterStates.forEach((st, chId) => {
                chaptersSnapshot.push({
                    chapter: chId,
                    chars: st.chars.map((c) => ({ slot: c.slot, alive: c.alive, hp: c.hp })),
                    objs: st.objs.map((o) => ({ slot: o.slot, opened: o.opened, unlocked: o.unlocked })),
                });
            });
            const snapshot = {
                version: 4,
                savedAt: new Date().toISOString(),
                chapter: curChapter.chapter,
                activeSkillIdx,
                player: {
                    x: Number(player.x.toFixed(2)),
                    y: Number(player.y.toFixed(2)),
                    hp: player.hp,
                    maxHp: player.maxHp,
                    mp: player.mp,
                    maxMp: player.maxMp,
                    dir: player.dir,
                    swordName: player.swordName,
                    swordPower: player.swordPower,
                    exp: player.exp,
                },
                inventory: Array.from(inventory.values()),
                chapters: chaptersSnapshot,
            };
            try {
                window.localStorage.setItem(`swordsman_save_${slotKey}`, JSON.stringify(snapshot));
                pushLog(`[저장 완료] ${slotKey} 슬롯에 상태가 기록되었습니다. (CH${curChapter.chapter}, HP ${player.hp}/${player.maxHp})`);
            }
            catch (err) {
                pushLog(`[저장 실패] ${String(err)}`);
            }
        };
        const loadGameState = (slotKey) => {
            const raw = window.localStorage.getItem(`swordsman_save_${slotKey}`);
            if (!raw) {
                saveGameState(slotKey);
                pushLog(`[불러오기 완료] ${slotKey} 슬롯 초기 스냅샷 생성 및 복원됨`);
                return;
            }
            try {
                const snap = JSON.parse(raw);
                chapterStates.clear();
                if (snap.chapters) {
                    for (const cSnap of snap.chapters) {
                        const chDef = world.chapters.find((c) => c.chapter === cSnap.chapter && c.active);
                        if (!chDef)
                            continue;
                        const restoredChars = chDef.chars.map((c) => {
                            const saved = cSnap.chars.find((sc) => sc.slot === c.slot);
                            return {
                                ...c,
                                alive: saved ? saved.alive : true,
                                hp: saved ? saved.hp : c.hp,
                                hitFlash: 0,
                                aiCooldown: 0.8,
                            };
                        });
                        const restoredObjs = chDef.objs.map((o) => {
                            const saved = cSnap.objs.find((so) => so.slot === o.slot);
                            return {
                                ...o,
                                opened: saved ? saved.opened : false,
                                unlocked: saved ? saved.unlocked : o.kind !== 'portal' || chDef.chapter !== 0,
                            };
                        });
                        chapterStates.set(cSnap.chapter, { chars: restoredChars, objs: restoredObjs });
                    }
                }
                inventory.clear();
                for (const it of snap.inventory || []) {
                    inventory.set(it.id, { ...it });
                }
                activeSkillIdx = Math.max(0, Math.min(martialArts.length - 1, snap.activeSkillIdx || 0));
                player.hp = snap.player.hp;
                player.maxHp = snap.player.maxHp;
                player.mp = snap.player.mp;
                player.maxMp = snap.player.maxMp;
                player.dir = snap.player.dir || 2;
                player.swordName = snap.player.swordName || '화산검법';
                player.swordPower = snap.player.swordPower || 55;
                player.exp = snap.player.exp || 0;
                loadChapter(snap.chapter, { x: snap.player.x, y: snap.player.y });
                pushLog(`[불러오기 완료] ${slotKey} 슬롯 복원됨 (CH${snap.chapter}, HP ${player.hp}/${player.maxHp})`);
            }
            catch (err) {
                pushLog(`[불러오기 오류] ${String(err)}`);
            }
        };
        const applyDamageToChar = (target, dmg, skillLabel, allowCounter) => {
            if (!target.alive)
                return;
            target.hp = Math.max(0, target.hp - dmg);
            target.hitFlash = 0.25;
            playVoc('hit');
            spawnFloating(target.x, target.y, `-${dmg}`, target.is_boss ? '#f4d078' : '#ff8a80');
            if (target.hp <= 0) {
                target.alive = false;
                const bonus = target.is_boss ? 250 : 60;
                player.exp += bonus;
                spawnFloating(target.x, target.y - 0.3, `+${bonus} EXP`, '#69f0ae');
                pushLog(`[${skillLabel}] ${target.name} 격파! (+${bonus} EXP)`);
                updateStatusUi();
                updateObjsUi();
                if (target.defeat_comd !== null && curChapter.comds[target.defeat_comd]) {
                    runComd(target.defeat_comd);
                }
                if (curChapter.chapter === 14 && target.is_boss) {
                    pushLog('🏆 동방불패 격파! 진 엔딩(D9) 시퀀스로 이어집니다.');
                    window.setTimeout(() => {
                        if (!introPlaying)
                            startEnding('d9');
                    }, 1100);
                }
                return;
            }
            if (allowCounter) {
                const counterDmg = Math.max(5, Math.min(25, Math.floor(target.attack * 0.4)));
                player.hp = Math.max(10, player.hp - counterDmg);
                spawnFloating(player.x, player.y, `-${counterDmg}`, '#ff7043');
                pushLog(`${target.name}에게 ${dmg} 피해! (남은 HP ${target.hp}/${target.max_hp}, 반격 -${counterDmg})`);
            }
            else {
                pushLog(`[${skillLabel}] ${target.name}에게 ${dmg} 피해! (남은 HP ${target.hp}/${target.max_hp})`);
            }
            updateStatusUi();
            updateObjsUi();
        };
        const performAttack = () => {
            player.state = 'attack';
            player.stateTimer = 0.36;
            player.animTick = 0;
            let sk = martialArts[activeSkillIdx] || martialArts[0];
            if (sk.mp_cost > 0 && player.mp < sk.mp_cost) {
                if (sk.heal_hp > 0) {
                    pushLog(`[${sk.name}] 내공이 부족합니다 (필요 MP ${sk.mp_cost}).`);
                    return;
                }
                pushLog(`[${sk.name}] 내공 부족으로 기본 [화산검법]으로 전환합니다.`);
                sk = martialArts[0];
            }
            if (sk.mp_cost > 0) {
                player.mp = Math.max(0, player.mp - sk.mp_cost);
            }
            // 1. Qi Healing skill (자하진기)
            if (sk.heal_hp > 0) {
                playVoc('chest');
                player.hp = Math.min(player.maxHp, player.hp + sk.heal_hp);
                spawnPulse(player.x, player.y, 2.2, sk.color);
                spawnFloating(player.x, player.y, `+${sk.heal_hp} HP`, sk.color);
                pushLog(`[${sk.name}] 운기조식으로 체력 +${sk.heal_hp} 회복! (MP -${sk.mp_cost})`);
                updateStatusUi();
                return;
            }
            playVoc('sword');
            const st = getCurState();
            // 2. AOE Drain skill (흡성대법)
            if (sk.aoe) {
                spawnPulse(player.x, player.y, sk.range, sk.color);
                const targets = st.chars.filter((ch) => ch.alive && Math.hypot(ch.x - player.x, ch.y - player.y) <= sk.range);
                if (targets.length === 0) {
                    pushLog(`[${sk.name}] 주변 ${sk.range}타일 내에 적이 없습니다. (MP -${sk.mp_cost})`);
                    updateStatusUi();
                    return;
                }
                let totalDmg = 0;
                for (const ch of targets) {
                    const dmg = sk.damage + Math.floor(Math.random() * 18);
                    totalDmg += dmg;
                    applyDamageToChar(ch, dmg, sk.name, false);
                }
                const absorbHp = Math.min(80, Math.round(totalDmg * 0.2));
                const absorbMp = Math.min(35, Math.round(totalDmg * 0.1));
                player.hp = Math.min(player.maxHp, player.hp + absorbHp);
                player.mp = Math.min(player.maxMp, player.mp + absorbMp);
                spawnFloating(player.x, player.y, `흡수 +${absorbHp} HP`, '#b388ff');
                pushLog(`[${sk.name}] ${targets.length}명 타격! (+${absorbHp} HP / +${absorbMp} MP 흡수)`);
                updateStatusUi();
                return;
            }
            // 3. Ranged Projectile skill (독고구검 / 벽사검법)
            if (sk.proj) {
                let dirX = 0;
                let dirY = 1;
                let nearest = null;
                let bestDist = sk.range + 2.5;
                for (const ch of st.chars) {
                    if (!ch.alive)
                        continue;
                    const d = Math.hypot(ch.x - player.x, ch.y - player.y);
                    if (d < bestDist) {
                        bestDist = d;
                        nearest = ch;
                    }
                }
                if (nearest) {
                    const d = Math.max(0.01, Math.hypot(nearest.x - player.x, nearest.y - player.y));
                    dirX = (nearest.x - player.x) / d;
                    dirY = (nearest.y - player.y) / d;
                    player.dir = Math.abs(dirX) >= Math.abs(dirY) ? (dirX >= 0 ? 1 : 3) : dirY >= 0 ? 2 : 0;
                }
                else {
                    const dirVecs = [
                        [0, -1],
                        [1, 0],
                        [0, 1],
                        [-1, 0],
                    ];
                    const dv = dirVecs[player.dir % 4];
                    dirX = dv[0];
                    dirY = dv[1];
                }
                const speed = 13.5;
                projectiles.push({
                    x: player.x,
                    y: player.y,
                    vx: dirX * speed,
                    vy: dirY * speed,
                    life: sk.range / speed + 0.12,
                    maxLife: sk.range / speed + 0.12,
                    damage: Math.max(sk.damage, player.swordPower + 25) + Math.floor(Math.random() * 18),
                    color: sk.color,
                    name: sk.name,
                    pierced: new Set(),
                });
                pushLog(`[${sk.name}] 장풍/검기 발사! (MP -${sk.mp_cost})`);
                updateStatusUi();
                return;
            }
            // 4. Default Melee skill (화산검법)
            let target = null;
            let bestDist = sk.range || 3.2;
            for (const ch of st.chars) {
                if (!ch.alive)
                    continue;
                const d = Math.hypot(ch.x - player.x, ch.y - player.y);
                if (d < bestDist) {
                    bestDist = d;
                    target = ch;
                }
            }
            if (!target) {
                pushLog(`허공에 [${sk.name}] 검기를 펼쳤습니다.`);
                return;
            }
            const dx = target.x - player.x;
            const dy = target.y - player.y;
            player.dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 1 : 3) : dy >= 0 ? 2 : 0;
            const basePower = Math.max(sk.damage, player.swordPower);
            const dmg = basePower + Math.floor(Math.random() * 16);
            applyDamageToChar(target, dmg, sk.name, true);
        };
        const drawSprite = (sprId, wx, wy) => {
            if (!sprId)
                return;
            const pair = spriteMaps.get(curChapter.chapter);
            if (!pair)
                return;
            const origSp = pair.orig.get(sprId);
            if (!origSp || origSp.orig_x >= 48 || origSp.w >= 120)
                return;
            const isHd = this.isGlobalHdMode();
            const hdSp = pair.hd.get(sprId);
            const hdImg = this.gameSheetHdCache.get(curChapter.chapter);
            const origImg = this.gameSheetOrigCache.get(curChapter.chapter);
            const { ix, iy } = worldToIso(wx, wy);
            const camIso = worldToIso(camera.x, camera.y);
            const drawX = Math.round(canvas.width / 2 + (ix - camIso.ix - 16 + origSp.orig_x) * SCALE);
            const drawY = Math.round(canvas.height / 2 + (iy - camIso.iy - 48 + origSp.orig_y) * SCALE);
            if (isHd && hdImg && hdImg.complete && hdSp) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(hdImg, hdSp.sx, hdSp.sy, hdSp.w, hdSp.h, drawX, drawY, hdSp.w, hdSp.h);
            }
            else if (origImg && origImg.complete) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(origImg, origSp.sx, origSp.sy, origSp.w, origSp.h, drawX, drawY, origSp.w * SCALE, origSp.h * SCALE);
            }
        };
        const pickPhaseSprite = (phaseIdx, dir, action, tick) => {
            const ph = curChapter.phases[phaseIdx] || curChapter.phases[0];
            if (!ph || ph.frames.length === 0)
                return null;
            const pair = spriteMaps.get(curChapter.chapter);
            const base = (dir % 4) * ph.stride;
            const isValidFrame = (id) => {
                if (!id || !pair)
                    return false;
                const sp = pair.orig.get(id);
                return Boolean(sp && sp.orig_x < 48 && sp.w < 120);
            };
            const offsets = action === 'attack'
                ? [50, 51, 52, 53, 54, 55, 16, 17, 18]
                : action === 'walk'
                    ? [4, 5, 6, 7, 0, 1]
                    : [0, 1, 2, 3];
            const validPool = [];
            for (const off of offsets) {
                const fid = ph.frames[base + off];
                if (fid && isValidFrame(fid))
                    validPool.push(fid);
            }
            if (validPool.length > 0) {
                return validPool[tick % validPool.length];
            }
            for (let i = 0; i < ph.frames.length; i++) {
                const fid = ph.frames[(base + i) % ph.frames.length];
                if (fid && isValidFrame(fid))
                    return fid;
            }
            return null;
        };
        const renderFrame = () => {
            const W = canvas.width;
            const H = canvas.height;
            const isHd = this.isGlobalHdMode();
            renderBadge.textContent = isHd ? '✨ 2× EPX HD' : '🕹 DOS 1× 픽셀';
            ctx.fillStyle = '#070a0f';
            ctx.fillRect(0, 0, W, H);
            if (introPlaying && introImg && introImg.complete) {
                ctx.imageSmoothingEnabled = isHd;
                const scale = Math.min(W / introImg.width, H / introImg.height);
                const dw = Math.round(introImg.width * scale);
                const dh = Math.round(introImg.height * scale);
                ctx.drawImage(introImg, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh);
                ctx.fillStyle = 'rgba(0,0,0,0.62)';
                ctx.fillRect(14, H - 38, W - 28, 26);
                ctx.fillStyle = '#f6e7c1';
                ctx.font = '13px "Malgun Gothic", sans-serif';
                ctx.fillText(introCaption, 24, H - 20);
                return;
            }
            const st = getCurState();
            const camIso = worldToIso(camera.x, camera.y);
            const viewMinSum = Math.floor(camera.x + camera.y - 22);
            const viewMaxSum = Math.ceil(camera.x + camera.y + 22);
            const viewMinDiff = Math.floor(camera.x - camera.y - 20);
            const viewMaxDiff = Math.ceil(camera.x - camera.y + 20);
            // 1. Ground flat tiles pass
            const tallItems = [];
            for (let sum = viewMinSum; sum <= viewMaxSum; sum++) {
                for (let gx = 0; gx < curChapter.map_w; gx++) {
                    const gy = sum - gx;
                    if (gy < 0 || gy >= curChapter.map_h)
                        continue;
                    const diff = gx - gy;
                    if (diff < viewMinDiff || diff > viewMaxDiff)
                        continue;
                    const tid = curGrid[gy * curChapter.map_w + gx] || 0;
                    const ter = curChapter.ter[tid];
                    if (!ter || !ter.spr_id)
                        continue;
                    if (ter.tall) {
                        // Draw base ground stone beneath walls/trees so no dark voids show at wall base
                        const baseGround = curChapter.ter[0];
                        if (baseGround && baseGround.spr_id) {
                            drawSprite(baseGround.spr_id, gx, gy);
                        }
                        tallItems.push({
                            depth: gx + gy,
                            draw: () => drawSprite(ter.spr_id, gx, gy),
                        });
                    }
                    else {
                        drawSprite(ter.spr_id, gx, gy);
                    }
                }
            }
            // Ground tile highlight under moveTarget & player
            if (player.moveTarget) {
                const ti = worldToIso(player.moveTarget.x, player.moveTarget.y);
                const tx = W / 2 + (ti.ix - camIso.ix) * SCALE;
                const ty = H / 2 + (ti.iy - camIso.iy) * SCALE;
                ctx.strokeStyle = 'rgba(61, 168, 142, 0.85)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(tx, ty - 14);
                ctx.lineTo(tx + 28, ty);
                ctx.lineTo(tx, ty + 14);
                ctx.lineTo(tx - 28, ty);
                ctx.closePath();
                ctx.stroke();
            }
            // 2. Depth-sorted objects, enemies, NPCs, and Player
            for (const obj of st.objs) {
                tallItems.push({
                    depth: obj.x + obj.y + 0.08,
                    draw: () => {
                        const oIso = worldToIso(obj.x, obj.y);
                        const sx = W / 2 + (oIso.ix - camIso.ix) * SCALE;
                        const sy = H / 2 + (oIso.iy - camIso.iy) * SCALE;
                        if (obj.kind === 'portal') {
                            const pulse = 18 + Math.sin(performance.now() * 0.005) * 4;
                            ctx.fillStyle = obj.unlocked ? 'rgba(61, 168, 142, 0.25)' : 'rgba(212, 168, 83, 0.16)';
                            ctx.beginPath();
                            ctx.ellipse(sx, sy, pulse * 1.4, pulse * 0.7, 0, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.strokeStyle = obj.unlocked ? '#3da88e' : '#d4a853';
                            ctx.lineWidth = 2;
                            ctx.stroke();
                            ctx.fillStyle = '#e7f9f2';
                            ctx.font = 'bold 11px "Malgun Gothic", sans-serif';
                            ctx.textAlign = 'center';
                            ctx.fillText(obj.label, sx, sy - 14);
                            ctx.textAlign = 'left';
                        }
                        else if (obj.spr_id) {
                            drawSprite(obj.spr_id, obj.x, obj.y);
                            if (obj.kind === 'chest' && !obj.opened) {
                                ctx.fillStyle = 'rgba(212, 168, 83, 0.9)';
                                ctx.fillRect(sx - 3, sy - 46, 6, 6);
                            }
                        }
                        else {
                            ctx.fillStyle = 'rgba(212, 168, 83, 0.35)';
                            ctx.beginPath();
                            ctx.arc(sx, sy - 10, 8, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    },
                });
            }
            for (const ch of st.chars) {
                if (!ch.alive)
                    continue;
                tallItems.push({
                    depth: ch.x + ch.y + 0.15,
                    draw: () => {
                        const cIso = worldToIso(ch.x, ch.y);
                        const sx = W / 2 + (cIso.ix - camIso.ix) * SCALE;
                        const sy = H / 2 + (cIso.iy - camIso.iy) * SCALE;
                        const sid = pickPhaseSprite(ch.phase_idx, ch.dir, 'idle', Math.floor(performance.now() / 320));
                        drawSprite(sid, ch.x, ch.y);
                        if (ch.hitFlash > 0) {
                            ctx.fillStyle = 'rgba(255, 80, 60, 0.45)';
                            ctx.beginPath();
                            ctx.arc(sx, sy - 24, 20, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        // Mini HP bar above enemy
                        const bw = 42;
                        const ratio = Math.max(0, Math.min(1, ch.hp / Math.max(1, ch.max_hp)));
                        ctx.fillStyle = 'rgba(0,0,0,0.75)';
                        ctx.fillRect(sx - bw / 2, sy - 64, bw, 5);
                        ctx.fillStyle = ch.is_boss ? '#f4d078' : '#e05252';
                        ctx.fillRect(sx - bw / 2 + 1, sy - 63, (bw - 2) * ratio, 3);
                        ctx.fillStyle = ch.is_boss ? '#fff4cf' : '#d8dee9';
                        ctx.font = '11px "Malgun Gothic", sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText(ch.name, sx, sy - 69);
                        ctx.textAlign = 'left';
                    },
                });
            }
            tallItems.push({
                depth: player.x + player.y + 0.2,
                draw: () => {
                    const pIso = worldToIso(player.x, player.y);
                    const sx = W / 2 + (pIso.ix - camIso.ix) * SCALE;
                    const sy = H / 2 + (pIso.iy - camIso.iy) * SCALE;
                    // Subtle hero ground halo
                    ctx.strokeStyle = 'rgba(212, 168, 83, 0.65)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.ellipse(sx, sy + 2, 16, 8, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    const sid = pickPhaseSprite(0, player.dir, player.state, player.animTick);
                    drawSprite(sid, player.x, player.y);
                    if (player.state === 'attack') {
                        ctx.strokeStyle = 'rgba(255, 224, 130, 0.9)';
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.arc(sx, sy - 22, 34, -0.6, Math.PI * 0.95);
                        ctx.stroke();
                    }
                },
            });
            tallItems.sort((a, b) => a.depth - b.depth);
            for (const item of tallItems)
                item.draw();
            // 3. Expanding Qi/AOE pulse rings
            for (const ring of pulseRings) {
                const t = 1 - ring.life / Math.max(0.01, ring.maxLife);
                const rIso = worldToIso(ring.x, ring.y);
                const sx = W / 2 + (rIso.ix - camIso.ix) * SCALE;
                const sy = H / 2 + (rIso.iy - camIso.iy) * SCALE;
                const rx = Math.max(8, ring.maxR * 28 * t);
                ctx.save();
                ctx.globalAlpha = Math.max(0, 0.75 * (1 - t));
                ctx.strokeStyle = ring.color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.ellipse(sx, sy, rx, rx * 0.52, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
            // 4. Flying sword-qi projectiles
            for (const proj of projectiles) {
                const pIso = worldToIso(proj.x, proj.y);
                const sx = W / 2 + (pIso.ix - camIso.ix) * SCALE;
                const sy = H / 2 + (pIso.iy - camIso.iy) * SCALE - 24;
                ctx.save();
                ctx.fillStyle = proj.color;
                ctx.shadowColor = proj.color;
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(sx, sy, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(sx, sy, 2.8, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            // 5. Floating damage & heal popups
            ctx.save();
            ctx.font = 'bold 13px "Malgun Gothic", sans-serif';
            ctx.textAlign = 'center';
            for (const ft of floatingTexts) {
                const progress = 1 - ft.life / Math.max(0.01, ft.maxLife);
                const fIso = worldToIso(ft.x, ft.y);
                const sx = W / 2 + (fIso.ix - camIso.ix) * SCALE;
                const sy = H / 2 + (fIso.iy - camIso.iy) * SCALE - 58 - progress * 24;
                ctx.globalAlpha = Math.max(0, 1 - progress * 0.85);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
                ctx.fillText(ft.text, sx + 1, sy + 1);
                ctx.fillStyle = ft.color;
                ctx.fillText(ft.text, sx, sy);
            }
            ctx.restore();
            // Top-left chapter HUD pill
            ctx.fillStyle = 'rgba(11, 14, 20, 0.78)';
            ctx.fillRect(10, 10, 320, 26);
            ctx.strokeStyle = 'rgba(212, 168, 83, 0.45)';
            ctx.lineWidth = 1;
            ctx.strokeRect(10, 10, 320, 26);
            ctx.fillStyle = '#f6e7c1';
            ctx.font = '12px "Malgun Gothic", sans-serif';
            ctx.fillText(curChapter.title, 18, 27);
        };
        const keysDown = new Set();
        let heldMoveVec = null;
        const moveStep = (dx, dy, dt) => {
            const speed = 6.2;
            const nx = player.x + dx * speed * dt;
            const ny = player.y + dy * speed * dt;
            let moved = false;
            if (isWalkable(nx, ny)) {
                player.x = nx;
                player.y = ny;
                moved = true;
            }
            else if (isWalkable(nx, player.y)) {
                player.x = nx;
                moved = true;
            }
            else if (isWalkable(player.x, ny)) {
                player.y = ny;
                moved = true;
            }
            if (Math.abs(dx) >= Math.abs(dy)) {
                player.dir = dx >= 0 ? 1 : 3;
            }
            else {
                player.dir = dy >= 0 ? 2 : 0;
            }
            if (moved) {
                coordBadge.textContent = `CH${curChapter.chapter} · (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`;
                const gx = Math.floor(player.x);
                const gy = Math.floor(player.y);
                const tid = curGrid[gy * curChapter.map_w + gx] || 0;
                const ter = curChapter.ter[tid];
                if (ter && ter.damage > 0 && player.hazardCooldown <= 0) {
                    player.hp = Math.max(5, player.hp - 12);
                    player.hazardCooldown = 0.8;
                    pushLog('함정(STING)에 밟혀 -12 HP!');
                    updateStatusUi();
                }
                // Check unlocked portal proximity after 1.5s spawn grace
                if (performance.now() - chapterEnteredAt > 1500) {
                    const portal = getCurState().objs.find((o) => o.kind === 'portal' && o.unlocked && Math.hypot(o.x - player.x, o.y - player.y) < 0.9);
                    if (portal)
                        runComd(portal.comd_id);
                }
            }
            return moved;
        };
        let lastTs = performance.now();
        let accumAnim = 0;
        let accumRegen = 0;
        const tickLoop = (now) => {
            var _a;
            const dt = Math.min(0.05, (now - lastTs) / 1000);
            lastTs = now;
            const tabActive = (_a = document.getElementById('tab-play')) === null || _a === void 0 ? void 0 : _a.classList.contains('active');
            if (tabActive) {
                const st = getCurState();
                player.hazardCooldown = Math.max(0, player.hazardCooldown - dt);
                for (const ch of st.chars) {
                    if (ch.hitFlash > 0)
                        ch.hitFlash = Math.max(0, ch.hitFlash - dt);
                }
                // Update pulse rings
                for (let i = pulseRings.length - 1; i >= 0; i--) {
                    pulseRings[i].life -= dt;
                    if (pulseRings[i].life <= 0)
                        pulseRings.splice(i, 1);
                }
                // Update floating damage/heal texts
                for (let i = floatingTexts.length - 1; i >= 0; i--) {
                    floatingTexts[i].life -= dt;
                    if (floatingTexts[i].life <= 0)
                        floatingTexts.splice(i, 1);
                }
                // Update flying martial arts projectiles
                for (let i = projectiles.length - 1; i >= 0; i--) {
                    const p = projectiles[i];
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.life -= dt;
                    for (const ch of st.chars) {
                        if (!ch.alive || p.pierced.has(ch.slot))
                            continue;
                        if (Math.hypot(ch.x - p.x, ch.y - p.y) < 1.35) {
                            p.pierced.add(ch.slot);
                            applyDamageToChar(ch, p.damage, p.name, false);
                        }
                    }
                    if (p.life <= 0 || p.x < 0 || p.y < 0 || p.x >= curChapter.map_w || p.y >= curChapter.map_h) {
                        projectiles.splice(i, 1);
                    }
                }
                // Gentle inner Qi MP recovery
                accumRegen += dt;
                if (accumRegen >= 0.8) {
                    accumRegen = 0;
                    if (player.mp < player.maxMp) {
                        player.mp = Math.min(player.maxMp, player.mp + 2);
                        updateStatusUi();
                    }
                }
                // Enemy AI aggro & counter-engagement
                if (aiChk.checked && !introPlaying && !activeComd) {
                    for (const ch of st.chars) {
                        if (!ch.alive)
                            continue;
                        ch.aiCooldown = Math.max(0, ch.aiCooldown - dt);
                        const dist = Math.hypot(player.x - ch.x, player.y - ch.y);
                        if (dist > 1.75 && dist <= 5.5) {
                            const step = (1.55 * dt) / dist;
                            const nx = ch.x + (player.x - ch.x) * step;
                            const ny = ch.y + (player.y - ch.y) * step;
                            if (isWalkable(nx, ny)) {
                                ch.x = nx;
                                ch.y = ny;
                            }
                            ch.dir = Math.abs(player.x - ch.x) >= Math.abs(player.y - ch.y)
                                ? player.x >= ch.x ? 1 : 3
                                : player.y >= ch.y ? 2 : 0;
                        }
                        else if (dist <= 1.85 && ch.aiCooldown <= 0) {
                            ch.aiCooldown = 1.65;
                            const aiDmg = Math.max(4, Math.min(20, Math.floor(ch.attack * 0.35)));
                            if (player.hp - aiDmg <= 10) {
                                player.hp = Math.min(player.maxHp, player.hp + 80);
                                spawnPulse(player.x, player.y, 1.8, '#69f0ae');
                                spawnFloating(player.x, player.y, '호신진기 +80', '#69f0ae');
                                pushLog('위기 호신진기 자동 발동! 체력 +80 보호');
                            }
                            else {
                                player.hp -= aiDmg;
                                spawnFloating(player.x, player.y, `-${aiDmg}`, '#ff8a65');
                                pushLog(`[적 교전] ${ch.name}의 공격 (-${aiDmg} HP)`);
                            }
                            updateStatusUi();
                        }
                    }
                }
                if (player.state === 'attack') {
                    player.stateTimer -= dt;
                    if (player.stateTimer <= 0)
                        player.state = 'idle';
                }
                if (!introPlaying && !activeComd) {
                    let kx = 0;
                    let ky = 0;
                    if (keysDown.has('w') || keysDown.has('arrowup')) {
                        kx -= 1;
                        ky -= 1;
                    }
                    if (keysDown.has('s') || keysDown.has('arrowdown')) {
                        kx += 1;
                        ky += 1;
                    }
                    if (keysDown.has('a') || keysDown.has('arrowleft')) {
                        kx -= 1;
                        ky += 1;
                    }
                    if (keysDown.has('d') || keysDown.has('arrowright')) {
                        kx += 1;
                        ky -= 1;
                    }
                    if (heldMoveVec) {
                        kx += heldMoveVec.dx;
                        ky += heldMoveVec.dy;
                    }
                    if (kx !== 0 || ky !== 0) {
                        player.moveTarget = null;
                        const len = Math.hypot(kx, ky);
                        moveStep(kx / len, ky / len, dt);
                        if (player.state !== 'attack')
                            player.state = 'walk';
                    }
                    else if (player.moveTarget) {
                        const dx = player.moveTarget.x - player.x;
                        const dy = player.moveTarget.y - player.y;
                        const dist = Math.hypot(dx, dy);
                        if (dist < 0.35) {
                            const pend = player.moveTarget.pendingObj;
                            player.moveTarget = null;
                            if (player.state !== 'attack')
                                player.state = 'idle';
                            if (pend)
                                interactWithObj(pend);
                            updateObjsUi();
                        }
                        else {
                            const moved = moveStep(dx / dist, dy / dist, dt);
                            if (player.state !== 'attack')
                                player.state = moved ? 'walk' : 'idle';
                            if (!moved) {
                                player.moveTarget = null;
                                updateObjsUi();
                            }
                        }
                    }
                    else if (player.state === 'walk') {
                        player.state = 'idle';
                    }
                }
                camera.x += (player.x - camera.x) * Math.min(1, dt * 10);
                camera.y += (player.y - camera.y) * Math.min(1, dt * 10);
                accumAnim += dt;
                if (accumAnim >= 0.14) {
                    accumAnim = 0;
                    player.animTick += 1;
                }
                renderFrame();
                renderMinimap();
            }
            window.requestAnimationFrame(tickLoop);
        };
        // UI event wiring
        chSel.addEventListener('change', () => loadChapter(Number(chSel.value)));
        runEvBtn.addEventListener('click', () => {
            const cid = Number(evSel.value);
            if (!Number.isNaN(cid))
                runComd(cid);
        });
        interactBtn.addEventListener('click', interactNearest);
        attackBtn.addEventListener('click', performAttack);
        introBtn.addEventListener('click', () => startIntro());
        skipIntroBtn.addEventListener('click', stopIntro);
        bgmBtn.addEventListener('click', () => syncBgm(bgmBtn.dataset.bgm !== 'on'));
        endingBtn.addEventListener('click', () => startEnding(endingSel.value || 'd9'));
        saveBtn.addEventListener('click', () => saveGameState(saveSlotSel.value || 'SV0'));
        loadBtn.addEventListener('click', () => loadGameState(saveSlotSel.value || 'SV0'));
        skillBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.skill-slot-btn');
            if (!btn)
                return;
            const idx = Number(btn.dataset.skillIdx);
            if (!Number.isNaN(idx) && idx >= 0 && idx < martialArts.length) {
                activeSkillIdx = idx;
                renderSkillBar();
                updateStatusUi();
                pushLog(`무공 선택: [${martialArts[idx].name}] (MP 소모 ${martialArts[idx].mp_cost})`);
            }
        });
        invList.addEventListener('click', (e) => {
            const row = e.target.closest('.inv-row');
            if (!row)
                return;
            const id = Number(row.dataset.itemId);
            if (!Number.isNaN(id))
                useInventoryItem(id);
        });
        minimapCanvas.addEventListener('click', (e) => {
            if (introPlaying)
                return;
            const rect = minimapCanvas.getBoundingClientRect();
            const gx = Math.max(1, Math.min(curChapter.map_w - 2, ((e.clientX - rect.left) / rect.width) * curChapter.map_w));
            const gy = Math.max(1, Math.min(curChapter.map_h - 2, ((e.clientY - rect.top) / rect.height) * curChapter.map_h));
            if (e.shiftKey && isWalkable(gx, gy)) {
                player.x = gx;
                player.y = gy;
                player.moveTarget = null;
                camera.x = gx;
                camera.y = gy;
                coordBadge.textContent = `CH${curChapter.chapter} · (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`;
                pushLog(`미니맵 즉시 이동: (${gx.toFixed(1)}, ${gy.toFixed(1)})`);
            }
            else {
                player.moveTarget = { x: gx, y: gy, pendingObj: null };
                pushLog(`미니맵 길찾기 목표: (${Math.round(gx)}, ${Math.round(gy)})`);
            }
            renderMinimap();
            updateObjsUi();
        });
        dlgNextBtn.addEventListener('click', () => {
            if (!activeComd)
                return;
            activeComd.sayCursor += 1;
            renderDlgStep();
        });
        dlgCloseBtn.addEventListener('click', () => {
            activeComd = null;
            dlgBox.hidden = true;
        });
        canvas.addEventListener('click', (e) => {
            if (introPlaying)
                return;
            const rect = canvas.getBoundingClientRect();
            const cx = ((e.clientX - rect.left) / rect.width) * canvas.width;
            const cy = ((e.clientY - rect.top) / rect.height) * canvas.height;
            const camIso = worldToIso(camera.x, camera.y);
            const ix = camIso.ix + (cx - canvas.width / 2) / SCALE;
            const iy = camIso.iy + (cy - canvas.height / 2) / SCALE;
            const target = isoToWorld(ix, iy);
            const gx = Math.max(1, Math.min(curChapter.map_w - 2, target.gx));
            const gy = Math.max(1, Math.min(curChapter.map_h - 2, target.gy));
            // Check if click landed near an object
            const st = getCurState();
            const hitObj = st.objs.find((o) => Math.hypot(o.x - gx, o.y - gy) < 1.35) || null;
            if (hitObj && Math.hypot(hitObj.x - player.x, hitObj.y - player.y) < 2.8) {
                interactWithObj(hitObj);
                return;
            }
            player.moveTarget = { x: gx, y: gy, pendingObj: hitObj };
        });
        Array.from(document.querySelectorAll('.game-move-btn')).forEach((btn) => {
            const el = btn;
            const dx = Number(el.dataset.dx || 0);
            const dy = Number(el.dataset.dy || 0);
            const len = Math.hypot(dx, dy) || 1;
            const nx = dx / len;
            const ny = dy / len;
            const startHold = (e) => {
                e.preventDefault();
                heldMoveVec = { dx: nx, dy: ny };
                el.classList.add('holding');
            };
            const stopHold = () => {
                if (heldMoveVec && heldMoveVec.dx === nx && heldMoveVec.dy === ny) {
                    heldMoveVec = null;
                }
                el.classList.remove('holding');
            };
            el.addEventListener('pointerdown', startHold);
            el.addEventListener('pointerup', stopHold);
            el.addEventListener('pointercancel', stopHold);
            el.addEventListener('pointerleave', stopHold);
            el.addEventListener('click', () => {
                moveStep(nx, ny, 0.16);
                player.animTick += 1;
                updateObjsUi();
            });
        });
        objList.addEventListener('click', (e) => {
            const row = e.target.closest('.obj-row');
            if (!row)
                return;
            const kind = row.dataset.type;
            const slot = Number(row.dataset.slot);
            const st = getCurState();
            if (kind === 'char') {
                const ch = st.chars.find((c) => c.slot === slot && c.alive);
                if (!ch)
                    return;
                player.x = Math.min(curChapter.map_w - 2, ch.x + 1.1);
                player.y = ch.y;
                player.moveTarget = null;
                camera.x = player.x;
                camera.y = player.y;
                coordBadge.textContent = `CH${curChapter.chapter} · (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`;
                updateObjsUi();
                renderMinimap();
                pushLog(`${ch.name} 앞으로 이동 (Space/공격으로 전투)`);
                return;
            }
            const obj = st.objs.find((o) => o.slot === slot);
            if (!obj)
                return;
            player.x = obj.kind === 'portal' ? obj.x : Math.max(1, obj.x - 1.1);
            player.y = obj.y;
            player.moveTarget = null;
            camera.x = player.x;
            camera.y = player.y;
            coordBadge.textContent = `CH${curChapter.chapter} · (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`;
            interactWithObj(obj);
            updateObjsUi();
            renderMinimap();
        });
        window.addEventListener('keydown', (e) => {
            var _a, _b;
            if (!((_a = document.getElementById('tab-play')) === null || _a === void 0 ? void 0 : _a.classList.contains('active')))
                return;
            const activeTag = (_b = document.activeElement) === null || _b === void 0 ? void 0 : _b.tagName;
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT')
                return;
            const k = e.key.toLowerCase();
            if (k === 'f5') {
                e.preventDefault();
                saveGameState(saveSlotSel.value || 'QUICK');
                return;
            }
            if (k === 'f9') {
                e.preventDefault();
                loadGameState(saveSlotSel.value || 'QUICK');
                return;
            }
            if (k >= '1' && k <= '5') {
                const idx = Number(k) - 1;
                if (idx < martialArts.length) {
                    activeSkillIdx = idx;
                    renderSkillBar();
                    updateStatusUi();
                    pushLog(`무공 전환: [${martialArts[idx].name}]`);
                }
                return;
            }
            if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
                e.preventDefault();
            }
            if (k === ' ') {
                performAttack();
                return;
            }
            if (k === 'e' || k === 'enter') {
                interactNearest();
                return;
            }
            keysDown.add(k);
        });
        window.addEventListener('keyup', (e) => {
            keysDown.delete(e.key.toLowerCase());
        });
        this.gameOnModeChange = () => {
            renderDlgStep();
            if (bgmBtn.dataset.bgm === 'on')
                syncBgm(true);
        };
        loadChapter(0);
        window.requestAnimationFrame(tickLoop);
    }
}
window.addEventListener('DOMContentLoaded', () => {
    new SwordsManExplorer().init();
});
