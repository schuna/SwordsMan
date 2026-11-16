import { AdlibSynth } from './audio/adlibSynth.js';
import { ENDINGS } from './content/gameData.js';
import { CutscenePlayer } from './engine/cutscenePlayer.js';
import { SceneRenderer } from './engine/sceneRenderer.js';
import { GameWorld } from './systems/gameWorld.js';
import { SaveManager } from './systems/saveManager.js';
import { EndingId, InputSnapshot, MartialArtId } from './systems/types.js';
import { HudController } from './ui/hudController.js';

class SwordsManApp {
  private canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  private ctx = this.canvas.getContext('2d')!;
  private minimapCanvas = document.getElementById('gameMinimapCanvas') as HTMLCanvasElement | null;
  private minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;

  private synth = new AdlibSynth();
  private cutscenes = new CutscenePlayer();
  private world = new GameWorld();
  private renderer = new SceneRenderer();
  private saves = new SaveManager();
  private hud: HudController;

  private keysDown = new Set<string>();
  private heldMoveVec: { dx: number; dy: number } | null = null;
  private pendingAttack = false;
  private pendingParry = false;
  private pendingJump = false;
  private pendingInteract = false;
  private pendingSkill: MartialArtId | null = null;

  private lastFrameMs = performance.now();
  private uiRefreshAcc = 0;

  constructor() {
    this.hud = new HudController(
      (id) => this.world.selectMartialArt(id),
      (kind) => {
        if (this.world.useItem(kind)) {
          this.synth.playPickup();
          this.hud.update(this.world.getUIState());
        }
      }
    );
    this.bindInputs();
    this.bindUiControls();
    this.setupPwa();

    // 시작 시 오프닝 컷신 재생 (스킵 가능)
    this.world.cutsceneActive = true;
    this.cutscenes.playOpening(() => {
      this.world.cutsceneActive = false;
      this.hud.update(this.world.getUIState());
    });
    this.hud.update(this.world.getUIState());
    window.requestAnimationFrame((t) => this.loop(t));
  }

  private bindInputs(): void {
    const unlockAudio = () => this.synth.unlock();
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
        e.preventDefault();
      }
      if (this.cutscenes.isActive() && (k === 'escape' || k === ' ')) {
        this.cutscenes.skip();
        return;
      }
      this.keysDown.add(k);
      if (k === ' ' || k === 'j') this.pendingAttack = true;
      else if (k === 'q' || k === 'k') this.pendingParry = true;
      else if (k === 'x') {
        this.pendingJump = true;
        this.synth.playJump();
      } else if (k === 'e' || k === 'f1') this.pendingInteract = true;
      else if (k >= '1' && k <= '5') this.pendingSkill = (Number(k) - 1) as MartialArtId;
      else if (e.key === 'F5') {
        e.preventDefault();
        this.saves.save('quick', this.world.exportSave());
        this.hud.showAlert('빠른 저장(QUICK) 완료');
      } else if (e.key === 'F9') {
        e.preventDefault();
        const data = this.saves.load('quick');
        if (data) {
          this.world.importSave(data);
          this.hud.showAlert('빠른 불러오기 완료');
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.key.toLowerCase());
    });

    document.querySelectorAll('.game-move-btn').forEach((btn) => {
      const el = btn as HTMLElement;
      const dx = Number(el.dataset.dx || 0);
      const dy = Number(el.dataset.dy || 0);
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;

      const startHold = (ev: Event) => {
        ev.preventDefault();
        this.heldMoveVec = { dx: nx, dy: ny };
        el.classList.add('holding');
      };
      const stopHold = () => {
        if (this.heldMoveVec && this.heldMoveVec.dx === nx && this.heldMoveVec.dy === ny) {
          this.heldMoveVec = null;
        }
        el.classList.remove('holding');
      };
      el.addEventListener('pointerdown', startHold);
      el.addEventListener('pointerup', stopHold);
      el.addEventListener('pointercancel', stopHold);
      el.addEventListener('pointerleave', stopHold);
    });

    document.getElementById('gameAttackBtn')?.addEventListener('click', () => {
      this.pendingAttack = true;
    });
    document.getElementById('gameParryBtn')?.addEventListener('click', () => {
      this.pendingParry = true;
    });
    document.getElementById('gameJumpBtn')?.addEventListener('click', () => {
      this.pendingJump = true;
      this.synth.playJump();
    });
    document.getElementById('gameInteractBtn')?.addEventListener('click', () => {
      this.pendingInteract = true;
    });
  }

  private bindUiControls(): void {
    document.getElementById('gameSkipIntroBtn')?.addEventListener('click', () => {
      this.cutscenes.skip();
    });
    document.getElementById('gameIntroBtn')?.addEventListener('click', () => {
      this.world.cutsceneActive = true;
      this.cutscenes.playOpening(() => {
        this.world.cutsceneActive = false;
      });
    });

    document.getElementById('gameDlgNextBtn')?.addEventListener('click', () => {
      this.world.advanceDialogue();
      this.hud.update(this.world.getUIState());
    });
    document.getElementById('gameDlgCloseBtn')?.addEventListener('click', () => {
      this.world.closeDialogue();
      this.hud.update(this.world.getUIState());
    });

    const bgmBtn = document.getElementById('gameBgmToggle');
    bgmBtn?.addEventListener('click', () => {
      const next = !this.synth.isBgmEnabled();
      this.synth.setBgmEnabled(next);
      bgmBtn.textContent = next ? '🎵 BGM: ON' : '🎵 BGM: OFF';
      bgmBtn.classList.toggle('primary', next);
    });

    const chSel = document.getElementById('gameChapterSelect') as HTMLSelectElement | null;
    chSel?.addEventListener('change', () => {
      this.world.loadChapter(Number(chSel.value));
      this.hud.update(this.world.getUIState());
    });

    const slotSel = document.getElementById('gameSaveSlotSelect') as HTMLSelectElement | null;
    document.getElementById('gameSaveBtn')?.addEventListener('click', () => {
      const slot = slotSel?.value ?? '0';
      this.saves.save(slot, this.world.exportSave());
      this.hud.showAlert(`슬롯 [${slot.toUpperCase()}] 저장 완료`);
    });
    document.getElementById('gameLoadBtn')?.addEventListener('click', () => {
      const slot = slotSel?.value ?? '0';
      const data = this.saves.load(slot);
      if (data) {
        this.world.importSave(data);
        this.hud.update(this.world.getUIState());
        this.hud.showAlert(`슬롯 [${slot.toUpperCase()}] 불러오기 완료`);
      } else {
        this.hud.showAlert(`슬롯 [${slot.toUpperCase()}]에 저장된 데이터가 없습니다.`);
      }
    });

    const endSel = document.getElementById('gameEndingSelect') as HTMLSelectElement | null;
    document.getElementById('gameEndingBtn')?.addEventListener('click', () => {
      const eid = (endSel?.value ?? 'd9') as EndingId;
      this.playEnding(eid);
    });
  }

  private playEnding(eid: EndingId): void {
    const ending = ENDINGS[eid];
    if (!ending) return;
    this.synth.setMode('ENDING');
    this.world.cutsceneActive = true;
    this.cutscenes.playEnding(ending, () => {
      this.world.cutsceneActive = false;
      this.synth.setMode('FIELD');
    });
  }

  private setupPwa(): void {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    const installBtn = document.getElementById('pwaInstallBtn');
    let deferred: { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      installBtn?.classList.add('primary');
    });
    installBtn?.addEventListener('click', async () => {
      if (deferred) {
        await deferred.prompt();
        await deferred.userChoice;
        deferred = null;
      } else {
        alert('브라우저 메뉴(⋮ / 공유) → "앱 설치" 또는 "홈 화면에 추가"로 설치할 수 있습니다.');
      }
    });
  }

  private collectInput(): InputSnapshot {
    let mx = 0;
    let my = 0;
    if (this.keysDown.has('w') || this.keysDown.has('arrowup')) {
      mx -= 1;
      my -= 1;
    }
    if (this.keysDown.has('s') || this.keysDown.has('arrowdown')) {
      mx += 1;
      my += 1;
    }
    if (this.keysDown.has('a') || this.keysDown.has('arrowleft')) {
      mx -= 1;
      my += 1;
    }
    if (this.keysDown.has('d') || this.keysDown.has('arrowright')) {
      mx += 1;
      my -= 1;
    }
    if (this.heldMoveVec) {
      mx += this.heldMoveVec.dx;
      my += this.heldMoveVec.dy;
    }

    const snap: InputSnapshot = {
      moveX: mx,
      moveY: my,
      attackPressed: this.pendingAttack,
      parryPressed: this.pendingParry,
      jumpPressed: this.pendingJump,
      interactPressed: this.pendingInteract,
      skillSlotPressed: this.pendingSkill,
    };
    this.pendingAttack = false;
    this.pendingParry = false;
    this.pendingJump = false;
    this.pendingInteract = false;
    this.pendingSkill = null;
    return snap;
  }

  private loop(nowMs: number): void {
    const dtMs = Math.min(50, Math.max(1, nowMs - this.lastFrameMs));
    this.lastFrameMs = nowMs;

    if (this.cutscenes.isActive()) {
      this.cutscenes.update(dtMs);
      this.cutscenes.render(this.ctx, this.canvas.width, this.canvas.height, nowMs / 1000);
    } else {
      const input = this.collectInput();
      if (input.attackPressed) this.synth.playSwing(false);
      this.world.step(dtMs, input);

      const events = this.world.drainEvents();
      for (const ev of events) {
        if (ev.type === 'PLAYER_HIT') this.synth.playHit(ev.isCrit || ev.isGroggy);
        else if (ev.type === 'PARRY_SUCCESS') this.synth.playParry();
        else if (ev.type === 'ITEM_PICKUP' || ev.type === 'LEVEL_UP' || ev.type === 'ART_UNLOCKED') {
          this.synth.playPickup();
        } else if (ev.type === 'ENDING_TRIGGERED') {
          this.playEnding(ev.endingId);
        }
      }
      this.hud.handleEvents(events, dtMs);

      const hasBoss = this.world.enemies.some((e) => e.isBoss && e.state !== 'DEAD');
      this.synth.setMode(hasBoss ? 'BOSS' : 'FIELD');

      this.renderer.renderWorld(this.ctx, this.world, this.canvas.width, this.canvas.height, nowMs / 1000);
      if (this.minimapCtx && this.minimapCanvas) {
        this.renderer.renderMinimap(this.minimapCtx, this.world, this.minimapCanvas.width, this.minimapCanvas.height);
      }
    }

    this.uiRefreshAcc += dtMs;
    if (this.uiRefreshAcc >= 80) {
      this.uiRefreshAcc = 0;
      this.hud.update(this.world.getUIState());
    }

    window.requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new SwordsManApp();
});
