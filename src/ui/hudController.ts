import { CHAPTERS, ENDINGS, ITEM_LABELS, MARTIAL_ARTS } from '../content/gameData.js';
import { CombatEvent, EndingId, ItemKind, MartialArtId, ReadOnlyUIState } from '../systems/types.js';

export class HudController {
  private statusPill = document.getElementById('statusPill');
  private hpBar = document.getElementById('hudHpBar') as HTMLElement | null;
  private hpText = document.getElementById('hudHpText');
  private qiBar = document.getElementById('hudQiBar') as HTMLElement | null;
  private qiText = document.getElementById('hudQiText');
  private expText = document.getElementById('hudExpText');
  private comboBadge = document.getElementById('hudComboBadge');
  private objectiveText = document.getElementById('hudObjective');
  private coordBadge = document.getElementById('gameCoordBadge');
  private bossHud = document.getElementById('bossHud');
  private bossName = document.getElementById('bossName');
  private bossHpBar = document.getElementById('bossHpBar') as HTMLElement | null;
  private bossPoiseBar = document.getElementById('bossPoiseBar') as HTMLElement | null;
  private alertBanner = document.getElementById('alertBanner');
  private nearbyPrompt = document.getElementById('nearbyPrompt');
  private skillBar = document.getElementById('gameSkillBar');
  private statusBox = document.getElementById('gameStatusBox');
  private invList = document.getElementById('gameInventoryList');
  private logList = document.getElementById('gameLogList');
  private dlgBox = document.getElementById('gameDialogueBox');
  private dlgSpeaker = document.getElementById('gameDlgSpeaker');
  private dlgStepInfo = document.getElementById('gameDlgStepInfo');
  private dlgText = document.getElementById('gameDlgText');
  private skipIntroBtn = document.getElementById('gameSkipIntroBtn');
  private chapterSelect = document.getElementById('gameChapterSelect') as HTMLSelectElement | null;
  private endingSelect = document.getElementById('gameEndingSelect') as HTMLSelectElement | null;
  private minimapCoords = document.getElementById('gameMinimapCoords');

  private alertTimerMs = 0;

  constructor(
    private onSelectArt: (id: MartialArtId) => void,
    private onUseItem: (kind: ItemKind) => void
  ) {
    this.populateSelectors();
  }

  private populateSelectors(): void {
    if (this.chapterSelect) {
      this.chapterSelect.innerHTML = CHAPTERS.map(
        (c) => `<option value="${c.id}">${c.title}</option>`
      ).join('');
    }
    if (this.endingSelect) {
      this.endingSelect.innerHTML = (Object.keys(ENDINGS) as EndingId[])
        .map((k) => `<option value="${k}">${ENDINGS[k].title}</option>`)
        .join('');
    }
  }

  public showAlert(msg: string): void {
    if (!this.alertBanner) return;
    this.alertBanner.textContent = msg;
    this.alertBanner.hidden = false;
    this.alertTimerMs = 2600;
  }

  public handleEvents(events: CombatEvent[], dtMs: number): void {
    if (this.alertTimerMs > 0) {
      this.alertTimerMs -= dtMs;
      if (this.alertTimerMs <= 0 && this.alertBanner) {
        this.alertBanner.hidden = true;
      }
    }
    for (const ev of events) {
      if (ev.type === 'PARRY_SUCCESS') this.showAlert('저스트 패링 성공! (+35 내력)');
      else if (ev.type === 'BOSS_GROGGY') this.showAlert('적 자세 붕괴! 지금 극딜하세요!');
      else if (ev.type === 'LEVEL_UP') this.showAlert(`레벨 업! Lv.${ev.level} 달성`);
      else if (ev.type === 'ART_UNLOCKED') this.showAlert(`새 무공 전수: ${ev.name}`);
      else if (ev.type === 'CHAPTER_CHANGED') this.showAlert(ev.title);
    }
  }

  public update(state: ReadOnlyUIState): void {
    if (this.statusPill) {
      this.statusPill.textContent = `${state.chapterTitle} · Lv.${state.player.level}`;
    }
    if (this.hpBar) {
      this.hpBar.style.width = `${Math.round((state.player.hp / state.player.maxHp) * 100)}%`;
    }
    if (this.hpText) this.hpText.textContent = `${state.player.hp} / ${state.player.maxHp}`;
    if (this.qiBar) {
      this.qiBar.style.width = `${Math.round((state.player.qi / state.player.maxQi) * 100)}%`;
    }
    if (this.qiText) this.qiText.textContent = `${state.player.qi} / ${state.player.maxQi}`;
    if (this.expText) {
      this.expText.textContent = `Lv.${state.player.level} (${state.player.exp}/${state.player.nextExp})`;
    }
    if (this.comboBadge) {
      this.comboBadge.textContent = state.player.combo > 1 ? `${state.player.combo} 연격` : '';
      this.comboBadge.hidden = state.player.combo <= 1;
    }
    if (this.objectiveText) this.objectiveText.textContent = state.objective;
    if (this.coordBadge) {
      this.coordBadge.textContent = `CH${state.chapterId + 1} (${state.player.x}, ${state.player.y})`;
    }
    if (this.minimapCoords) {
      this.minimapCoords.textContent = `X:${state.player.x} Y:${state.player.y}`;
    }
    if (this.chapterSelect && Number(this.chapterSelect.value) !== state.chapterId) {
      this.chapterSelect.value = String(state.chapterId);
    }

    if (this.bossHud) {
      if (state.boss) {
        this.bossHud.hidden = false;
        if (this.bossName) {
          this.bossName.textContent = state.boss.isGroggy ? `${state.boss.name} [그로기!]` : state.boss.name;
        }
        if (this.bossHpBar) {
          this.bossHpBar.style.width = `${Math.round((state.boss.hp / state.boss.maxHp) * 100)}%`;
        }
        if (this.bossPoiseBar) {
          this.bossPoiseBar.style.width = `${Math.round((state.boss.poise / state.boss.maxPoise) * 100)}%`;
        }
      } else {
        this.bossHud.hidden = true;
      }
    }

    if (this.nearbyPrompt) {
      if (state.nearbyPrompt) {
        this.nearbyPrompt.textContent = state.nearbyPrompt;
        this.nearbyPrompt.hidden = false;
      } else {
        this.nearbyPrompt.hidden = true;
      }
    }

    if (this.skipIntroBtn) {
      this.skipIntroBtn.hidden = !state.cutsceneActive;
    }

    if (this.dlgBox) {
      if (state.dialogue) {
        this.dlgBox.hidden = false;
        if (this.dlgSpeaker) this.dlgSpeaker.textContent = state.dialogue.speaker;
        if (this.dlgStepInfo) this.dlgStepInfo.textContent = `${state.dialogue.step} / ${state.dialogue.total}`;
        if (this.dlgText) this.dlgText.textContent = state.dialogue.text;
      } else {
        this.dlgBox.hidden = true;
      }
    }

    if (this.skillBar) {
      this.skillBar.innerHTML = MARTIAL_ARTS.map((art) => {
        const unlocked = state.player.unlockedArts.includes(art.id);
        const active = state.player.activeArt === art.id;
        const cdSec = (state.player.cooldownsMs[art.id] / 1000).toFixed(1);
        return `<button class="btn small skill-slot ${active ? 'primary' : ''}" data-art="${art.id}" ${unlocked ? '' : 'disabled'}>
          [${art.id + 1}] ${art.name}${state.player.cooldownsMs[art.id] > 0 ? ` (${cdSec}s)` : ''}
        </button>`;
      }).join('');
      this.skillBar.querySelectorAll('[data-art]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = Number((btn as HTMLElement).dataset.art) as MartialArtId;
          this.onSelectArt(id);
        });
      });
    }

    if (this.statusBox) {
      this.statusBox.innerHTML = `
        <div><strong>${state.player.name}</strong> (Lv.${state.player.level})</div>
        <div>공격력: ${state.player.attackPower}${state.player.atkBuffMs > 0 ? ' (+35% 버프)' : ''} · 방어력: ${state.player.defense}</div>
        <div>해금 무공: ${state.player.unlockedArts.length} / ${MARTIAL_ARTS.length}</div>
      `;
    }

    if (this.invList) {
      const items = Object.keys(state.inventory) as ItemKind[];
      this.invList.innerHTML = items
        .map((k) => {
          const count = state.inventory[k];
          const usable = k !== 'SECRET_KEY' && count > 0;
          return `<div class="row-between inv-row">
            <span>${ITEM_LABELS[k]} × ${count}</span>
            ${usable ? `<button class="btn small" data-use-item="${k}">사용</button>` : ''}
          </div>`;
        })
        .join('');
      this.invList.querySelectorAll('[data-use-item]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.onUseItem((btn as HTMLElement).dataset.useItem as ItemKind);
        });
      });
    }

    if (this.logList) {
      this.logList.innerHTML = state.logs
        .slice(0, 14)
        .map((line) => `<div class="log-entry">• ${line}</div>`)
        .join('');
    }
  }
}
