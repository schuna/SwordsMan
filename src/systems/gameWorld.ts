import {
  CHAPTERS,
  ITEM_LABELS,
  MARTIAL_ARTS,
  buildChapterGrid,
  isTileWalkable,
} from '../content/gameData.js';
import { computeDamage } from './combatMath.js';
import {
  ChapterDef,
  CombatEvent,
  DialogueLine,
  EndingId,
  EntityRenderInfo,
  FloatingText,
  InputSnapshot,
  ItemKind,
  MartialArtId,
  PlayerActionState,
  ProjectileRenderInfo,
  ReadOnlyUIState,
  SaveSlotData,
  SpriteRole,
  TileKind,
} from './types.js';

interface RuntimeNpc {
  id: string;
  name: string;
  title: string;
  role: SpriteRole;
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  isEscort: boolean;
  dialogue: DialogueLine[];
  rewardArtId?: MartialArtId;
  rewardItem?: ItemKind;
  talked: boolean;
}

interface RuntimeEnemy {
  id: string;
  name: string;
  role: SpriteRole;
  kind: 'RAIDER' | 'ELITE' | 'BOSS';
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  hp: number;
  maxHp: number;
  attackPower: number;
  defense: number;
  poise: number;
  maxPoise: number;
  expReward: number;
  isBoss: boolean;
  unlocksPortal: boolean;
  triggersEnding?: EndingId;
  state: 'IDLE' | 'CHASE' | 'WINDUP' | 'ACTIVE' | 'RECOVER' | 'GROGGY' | 'DEAD';
  stateTimerMs: number;
  windupDurationMs: number;
  telegraph: 'PARRYABLE' | 'UNBLOCKABLE' | null;
  didHit: boolean;
  range: number;
}

interface RuntimeProjectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dist: number;
  maxDist: number;
  color: string;
  artId: MartialArtId;
  hitIds: Set<string>;
}

export class GameWorld {
  public chapter: ChapterDef = CHAPTERS[0];
  public grid: TileKind[][] = buildChapterGrid(CHAPTERS[0]);
  public npcs: RuntimeNpc[] = [];
  public enemies: RuntimeEnemy[] = [];
  public projectiles: RuntimeProjectile[] = [];
  public floatingTexts: FloatingText[] = [];

  public player = {
    name: '임청운',
    x: 5,
    y: 13,
    wz: 0,
    vz: 0,
    facingX: 1,
    facingY: 0,
    level: 1,
    exp: 0,
    nextExp: 100,
    hp: 360,
    maxHp: 360,
    qi: 120,
    maxQi: 120,
    attackPower: 42,
    defense: 16,
    state: 'IDLE' as PlayerActionState,
    stateTimerMs: 0,
    invulnMs: 0,
    parryWindowMs: 0,
    didAttackHit: false,
    combo: 0,
    comboResetMs: 0,
    activeArt: 0 as MartialArtId,
    unlockedArts: [0] as MartialArtId[],
    cooldownsMs: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 } as Record<MartialArtId, number>,
    atkBuffMs: 0,
  };

  public inventory: Record<ItemKind, number> = {
    HP_POTION: 2,
    QI_PILL: 2,
    ATK_ELIXIR: 1,
    SECRET_KEY: 0,
  };

  public clearedChapters = new Set<number>();
  public openedChests = new Set<string>();
  public logs: string[] = ['청운산문에서 모험을 시작했습니다.'];
  public paused = false;
  public cutsceneActive = false;

  private activeDialogue: {
    lines: DialogueLine[];
    index: number;
    onComplete?: () => void;
  } | null = null;

  private bufferedAction: 'ATTACK' | 'PARRY' | 'JUMP' | null = null;
  private bufferTimerMs = 0;
  private hitstopMs = 0;
  private nextId = 1;
  private events: CombatEvent[] = [];

  constructor() {
    this.loadChapter(0);
  }

  public drainEvents(): CombatEvent[] {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  private pushLog(msg: string): void {
    this.logs.unshift(msg);
    if (this.logs.length > 30) this.logs.pop();
    this.events.push({ type: 'LOG', message: msg });
  }

  private spawnFloat(x: number, y: number, text: string, color: string): void {
    this.floatingTexts.push({
      id: this.nextId++,
      x,
      y,
      text,
      color,
      ttlMs: 850,
      maxTtlMs: 850,
    });
  }

  public loadChapter(chapterId: number, spawnX?: number, spawnY?: number): void {
    const ch = CHAPTERS.find((c) => c.id === chapterId) ?? CHAPTERS[0];
    this.chapter = ch;
    this.grid = buildChapterGrid(ch);
    this.player.x = spawnX ?? ch.spawnX;
    this.player.y = spawnY ?? ch.spawnY;
    this.player.wz = 0;
    this.player.vz = 0;
    this.projectiles = [];
    this.floatingTexts = [];
    this.activeDialogue = null;

    this.npcs = ch.npcs.map((n) => ({
      id: n.id,
      name: n.name,
      title: n.title,
      role: n.role,
      x: n.x,
      y: n.y,
      facingX: -1,
      facingY: 0,
      isEscort: Boolean(n.isEscort),
      dialogue: n.dialogue,
      rewardArtId: n.rewardArtId,
      rewardItem: n.rewardItem,
      talked: false,
    }));

    this.enemies = ch.enemies.map((e) => ({
      id: e.id,
      name: e.name,
      role: e.role,
      kind: e.kind,
      x: e.x,
      y: e.y,
      facingX: -1,
      facingY: 0,
      hp: e.maxHp,
      maxHp: e.maxHp,
      attackPower: e.attackPower,
      defense: e.defense,
      poise: e.maxPoise,
      maxPoise: e.maxPoise,
      expReward: e.expReward,
      isBoss: Boolean(e.isBoss),
      unlocksPortal: Boolean(e.unlocksPortal),
      triggersEnding: e.triggersEnding,
      state: 'CHASE',
      stateTimerMs: 0,
      windupDurationMs: e.isBoss ? 780 : 600,
      telegraph: null,
      didHit: false,
      range: e.isBoss ? 3.2 : 2.1,
    }));

    this.pushLog(`${ch.title} 진입`);
    this.events.push({ type: 'CHAPTER_CHANGED', title: ch.title });

    if (ch.introDialogue && ch.introDialogue.length > 0) {
      this.activeDialogue = { lines: ch.introDialogue, index: 0 };
    }
  }

  public advanceDialogue(): void {
    if (!this.activeDialogue) return;
    this.activeDialogue.index += 1;
    if (this.activeDialogue.index >= this.activeDialogue.lines.length) {
      const cb = this.activeDialogue.onComplete;
      this.activeDialogue = null;
      if (cb) cb();
    }
  }

  public closeDialogue(): void {
    if (!this.activeDialogue) return;
    const cb = this.activeDialogue.onComplete;
    this.activeDialogue = null;
    if (cb) cb();
  }

  public selectMartialArt(artId: MartialArtId): void {
    if (!this.player.unlockedArts.includes(artId)) {
      this.spawnFloat(this.player.x, this.player.y, '미해금 무공', '#94a3b8');
      return;
    }
    this.player.activeArt = artId;
    this.pushLog(`무공 전환: ${MARTIAL_ARTS[artId].name}`);
  }

  public useItem(kind: ItemKind): boolean {
    if (this.inventory[kind] <= 0 || kind === 'SECRET_KEY') return false;
    this.inventory[kind] -= 1;
    if (kind === 'HP_POTION') {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 140);
      this.spawnFloat(this.player.x, this.player.y, '+140 체력', '#34d399');
    } else if (kind === 'QI_PILL') {
      this.player.qi = Math.min(this.player.maxQi, this.player.qi + 80);
      this.spawnFloat(this.player.x, this.player.y, '+80 내력', '#38bdf8');
    } else if (kind === 'ATK_ELIXIR') {
      this.player.atkBuffMs = 15000;
      this.spawnFloat(this.player.x, this.player.y, '공격력 증폭!', '#fbbf24');
    }
    this.pushLog(`${ITEM_LABELS[kind]} 사용`);
    return true;
  }

  public exportSave(): SaveSlotData {
    return {
      version: 5,
      savedAt: new Date().toLocaleString('ko-KR'),
      chapterId: this.chapter.id,
      playerX: this.player.x,
      playerY: this.player.y,
      level: this.player.level,
      exp: this.player.exp,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      qi: this.player.qi,
      maxQi: this.player.maxQi,
      activeArt: this.player.activeArt,
      unlockedArts: [...this.player.unlockedArts],
      inventory: { ...this.inventory },
      clearedChapters: Array.from(this.clearedChapters),
      openedChests: Array.from(this.openedChests),
    };
  }

  public importSave(data: SaveSlotData): void {
    this.clearedChapters = new Set(data.clearedChapters ?? []);
    this.openedChests = new Set(data.openedChests ?? []);
    this.inventory = { ...data.inventory };
    this.player.level = data.level;
    this.player.exp = data.exp;
    this.player.nextExp = data.level * 100;
    this.player.maxHp = data.maxHp;
    this.player.hp = data.hp;
    this.player.maxQi = data.maxQi;
    this.player.qi = data.qi;
    this.player.attackPower = 42 + (data.level - 1) * 5;
    this.player.unlockedArts = data.unlockedArts ?? [0];
    this.player.activeArt = data.activeArt ?? 0;
    this.loadChapter(data.chapterId, data.playerX, data.playerY);
    this.pushLog(`저장 데이터 불러오기 완료 (${data.savedAt})`);
  }

  public step(dtMs: number, input: InputSnapshot): void {
    if (this.paused || this.cutsceneActive) return;

    // 플로팅 텍스트 업데이트
    for (let i = this.floatingTexts.length - 1; i >= 0; i -= 1) {
      this.floatingTexts[i].ttlMs -= dtMs;
      if (this.floatingTexts[i].ttlMs <= 0) this.floatingTexts.splice(i, 1);
    }

    if (this.hitstopMs > 0) {
      this.hitstopMs = Math.max(0, this.hitstopMs - dtMs);
      return;
    }

    if (input.skillSlotPressed !== null) {
      this.selectMartialArt(input.skillSlotPressed);
    }

    if (this.activeDialogue) {
      if (input.interactPressed || input.attackPressed) {
        this.advanceDialogue();
      }
      return;
    }

    const dtSec = dtMs / 1000;
    const p = this.player;

    // 쿨다운 & 버프 & 자연 내력 회복
    (Object.keys(p.cooldownsMs) as unknown as MartialArtId[]).forEach((k) => {
      if (p.cooldownsMs[k] > 0) p.cooldownsMs[k] = Math.max(0, p.cooldownsMs[k] - dtMs);
    });
    if (p.atkBuffMs > 0) p.atkBuffMs = Math.max(0, p.atkBuffMs - dtMs);
    if (p.invulnMs > 0) p.invulnMs = Math.max(0, p.invulnMs - dtMs);
    if (p.parryWindowMs > 0) p.parryWindowMs = Math.max(0, p.parryWindowMs - dtMs);
    if (p.comboResetMs > 0) {
      p.comboResetMs = Math.max(0, p.comboResetMs - dtMs);
      if (p.comboResetMs === 0) p.combo = 0;
    }
    p.qi = Math.min(p.maxQi, p.qi + 5.5 * dtSec);

    // 경공 점프(wz) 물리
    if (p.wz > 0 || p.vz > 0) {
      p.wz += p.vz * dtSec;
      p.vz -= 16.5 * dtSec;
      if (p.wz <= 0) {
        p.wz = 0;
        p.vz = 0;
        if (p.state === 'JUMP') p.state = 'IDLE';
      }
    }

    // 선입력 버퍼
    if (input.parryPressed) {
      this.bufferedAction = 'PARRY';
      this.bufferTimerMs = 150;
    } else if (input.jumpPressed) {
      this.bufferedAction = 'JUMP';
      this.bufferTimerMs = 150;
    } else if (input.attackPressed) {
      this.bufferedAction = 'ATTACK';
      this.bufferTimerMs = 150;
    } else if (this.bufferTimerMs > 0) {
      this.bufferTimerMs = Math.max(0, this.bufferTimerMs - dtMs);
      if (this.bufferTimerMs === 0) this.bufferedAction = null;
    }

    if (input.interactPressed) {
      this.tryInteract();
    }

    // 액션 상태 머신
    const canAct = p.state === 'IDLE' || p.state === 'WALK' || p.state === 'JUMP';
    if (canAct && this.bufferedAction) {
      const act = this.bufferedAction;
      this.bufferedAction = null;
      this.bufferTimerMs = 0;
      if (act === 'JUMP' && p.wz === 0) {
        p.vz = 6.2;
        p.wz = 0.02;
        p.invulnMs = 240;
        p.state = 'JUMP';
      } else if (act === 'PARRY') {
        p.state = 'PARRY';
        p.stateTimerMs = 240;
        p.parryWindowMs = 200;
      } else if (act === 'ATTACK') {
        this.startPlayerAttack();
      }
    }

    if (p.state === 'PARRY') {
      p.stateTimerMs -= dtMs;
      if (p.stateTimerMs <= 0) p.state = 'IDLE';
    } else if (p.state === 'WINDUP') {
      p.stateTimerMs -= dtMs;
      if (p.stateTimerMs <= 0) {
        const art = MARTIAL_ARTS[p.activeArt];
        p.state = 'ACTIVE';
        p.stateTimerMs = art.activeMs;
        p.didAttackHit = false;
      }
    } else if (p.state === 'ACTIVE') {
      if (!p.didAttackHit) {
        p.didAttackHit = true;
        this.executePlayerAttackHit();
      }
      p.stateTimerMs -= dtMs;
      if (p.stateTimerMs <= 0) {
        p.state = 'RECOVER';
        p.stateTimerMs = MARTIAL_ARTS[p.activeArt].recoveryMs;
      }
    } else if (p.state === 'RECOVER') {
      p.stateTimerMs -= dtMs;
      if (p.stateTimerMs <= 0) p.state = 'IDLE';
    }

    // 이동 처리
    if ((p.state === 'IDLE' || p.state === 'WALK' || p.state === 'JUMP') && (input.moveX !== 0 || input.moveY !== 0)) {
      const len = Math.hypot(input.moveX, input.moveY) || 1;
      const dx = input.moveX / len;
      const dy = input.moveY / len;
      p.facingX = dx;
      p.facingY = dy;
      const speed = p.wz > 0 ? 7.4 : 5.8;
      const nx = p.x + dx * speed * dtSec;
      const ny = p.y + dy * speed * dtSec;
      if (this.canWalk(nx, ny, p.wz)) {
        p.x = nx;
        p.y = ny;
      } else if (this.canWalk(nx, p.y, p.wz)) {
        p.x = nx;
      } else if (this.canWalk(p.x, ny, p.wz)) {
        p.y = ny;
      }
      if (p.state === 'IDLE') p.state = 'WALK';
    } else if (p.state === 'WALK') {
      p.state = 'IDLE';
    }

    // 포탈 체크
    for (const portal of this.chapter.portals) {
      if (Math.hypot(p.x - portal.x, p.y - portal.y) < 0.85) {
        if (portal.requiresBossClear && !this.clearedChapters.has(this.chapter.id)) {
          // 보스 미격파 시 통과 대기
        } else {
          this.loadChapter(portal.targetChapter, portal.targetX, portal.targetY);
          return;
        }
      }
    }

    this.updateProjectiles(dtSec);
    this.updateNpcs(dtSec);
    this.updateEnemies(dtMs, dtSec);
  }

  private canWalk(wx: number, wy: number, wz: number): boolean {
    const gx = Math.round(wx);
    const gy = Math.round(wy);
    if (gx < 1 || gy < 1 || gx >= this.chapter.mapW - 1 || gy >= this.chapter.mapH - 1) return false;
    const tile = this.grid[gy]?.[gx];
    return tile ? isTileWalkable(tile, wz) : false;
  }

  private startPlayerAttack(): void {
    const p = this.player;
    const art = MARTIAL_ARTS[p.activeArt];
    if (p.cooldownsMs[art.id] > 0) return;
    if (p.qi < art.qiCost) {
      this.spawnFloat(p.x, p.y, '내력 부족!', '#f87171');
      return;
    }
    p.qi -= art.qiCost;
    p.cooldownsMs[art.id] = art.cooldownMs;
    p.state = 'WINDUP';
    p.stateTimerMs = art.windupMs;
  }

  private executePlayerAttackHit(): void {
    const p = this.player;
    const art = MARTIAL_ARTS[p.activeArt];
    const atkPower = p.atkBuffMs > 0 ? Math.round(p.attackPower * 1.35) : p.attackPower;

    if (art.kind === 'HEAL_BUFF') {
      p.hp = Math.min(p.maxHp, p.hp + 120);
      p.atkBuffMs = 10000;
      this.spawnFloat(p.x, p.y, '+120 치유 · 공증!', '#34d399');
      return;
    }

    if (art.kind === 'PROJECTILE') {
      const len = Math.hypot(p.facingX, p.facingY) || 1;
      this.projectiles.push({
        id: this.nextId++,
        x: p.x,
        y: p.y,
        vx: (p.facingX / len) * 12,
        vy: (p.facingY / len) * 12,
        dist: 0,
        maxDist: art.range,
        color: art.color,
        artId: art.id,
        hitIds: new Set(),
      });
      return;
    }

    for (const enemy of this.enemies) {
      if (enemy.state === 'DEAD') continue;
      const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
      if (dist <= art.range) {
        this.applyDamageToEnemy(enemy, atkPower, art.skillMult, art.poiseDamage, art.qiCost);
        if (art.kind === 'DRAIN_AOE') {
          p.hp = Math.min(p.maxHp, p.hp + 28);
          p.qi = Math.min(p.maxQi, p.qi + 14);
        }
      }
    }
  }

  private applyDamageToEnemy(
    enemy: RuntimeEnemy,
    atkPower: number,
    skillMult: number,
    poiseDmg: number,
    consumedQi: number
  ): void {
    const isGroggy = enemy.state === 'GROGGY';
    const res = computeDamage({
      attackPower: atkPower,
      skillMultiplier: skillMult,
      consumedQi,
      targetDefense: enemy.defense,
      critChance: 0.2,
      critMult: 1.5,
      isGroggy,
      groggyMult: 1.8,
    });

    enemy.hp = Math.max(0, enemy.hp - res.finalDamage);
    this.player.combo += 1;
    this.player.comboResetMs = 3500;
    this.player.qi = Math.min(this.player.maxQi, this.player.qi + 8);
    this.hitstopMs = 45;

    this.events.push({
      type: 'PLAYER_HIT',
      damage: res.finalDamage,
      isCrit: res.isCrit,
      isGroggy,
    });
    this.spawnFloat(
      enemy.x,
      enemy.y,
      isGroggy ? `극딜 -${res.finalDamage}!` : res.isCrit ? `치명 -${res.finalDamage}!` : `-${res.finalDamage}`,
      isGroggy || res.isCrit ? '#fbbf24' : '#e2e8f0'
    );

    if (!isGroggy && enemy.hp > 0) {
      enemy.poise -= poiseDmg;
      if (enemy.poise <= 0) {
        enemy.poise = 0;
        enemy.state = 'GROGGY';
        enemy.stateTimerMs = 2400;
        enemy.telegraph = null;
        this.events.push({ type: 'BOSS_GROGGY' });
        this.spawnFloat(enemy.x, enemy.y, '자세 붕괴(그로기)!', '#facc15');
      }
    }

    if (enemy.hp <= 0) {
      enemy.state = 'DEAD';
      enemy.telegraph = null;
      this.gainExp(enemy.expReward);
      this.pushLog(`${enemy.name} 격파! (+${enemy.expReward} EXP)`);
      if (enemy.unlocksPortal) {
        this.clearedChapters.add(this.chapter.id);
        this.pushLog('다음 지역으로 이어지는 포탈이 열렸습니다!');
      }
      if (enemy.triggersEnding) {
        this.clearedChapters.add(this.chapter.id);
        this.events.push({ type: 'ENDING_TRIGGERED', endingId: enemy.triggersEnding });
      }
    }
  }

  private gainExp(amount: number): void {
    const p = this.player;
    p.exp += amount;
    while (p.exp >= p.nextExp) {
      p.exp -= p.nextExp;
      p.level += 1;
      p.nextExp = p.level * 100;
      p.maxHp += 35;
      p.hp = p.maxHp;
      p.maxQi += 15;
      p.qi = p.maxQi;
      p.attackPower += 5;
      this.events.push({ type: 'LEVEL_UP', level: p.level });
      this.spawnFloat(p.x, p.y, `LEVEL UP! Lv.${p.level}`, '#38bdf8');
      this.pushLog(`레벨 업! Lv.${p.level} 달성 (체력·내력 완전 회복)`);
    }
  }

  private updateProjectiles(dtSec: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const pr = this.projectiles[i];
      const stepDist = Math.hypot(pr.vx * dtSec, pr.vy * dtSec);
      pr.x += pr.vx * dtSec;
      pr.y += pr.vy * dtSec;
      pr.dist += stepDist;

      const art = MARTIAL_ARTS[pr.artId];
      for (const e of this.enemies) {
        if (e.state === 'DEAD' || pr.hitIds.has(e.id)) continue;
        if (Math.hypot(e.x - pr.x, e.y - pr.y) < 1.35) {
          pr.hitIds.add(e.id);
          const atk = this.player.atkBuffMs > 0 ? Math.round(this.player.attackPower * 1.35) : this.player.attackPower;
          this.applyDamageToEnemy(e, atk, art.skillMult, art.poiseDamage, art.qiCost);
        }
      }

      if (pr.dist >= pr.maxDist || !this.canWalk(pr.x, pr.y, 1)) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateNpcs(dtSec: number): void {
    for (const npc of this.npcs) {
      if (!npc.isEscort) continue;
      const dx = this.player.x - 1.4 - npc.x;
      const dy = this.player.y - npc.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1.8) {
        npc.x += (dx / dist) * 4.5 * dtSec;
        npc.y += (dy / dist) * 4.5 * dtSec;
        npc.facingX = dx;
        npc.facingY = dy;
      }
    }
  }

  private updateEnemies(dtMs: number, dtSec: number): void {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.state === 'DEAD') continue;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) {
        e.facingX = dx / dist;
        e.facingY = dy / dist;
      }

      if (e.state === 'GROGGY') {
        e.stateTimerMs -= dtMs;
        if (e.stateTimerMs <= 0) {
          e.poise = e.maxPoise;
          e.state = 'CHASE';
        }
        continue;
      }

      if (e.state === 'CHASE') {
        if (dist <= e.range * 0.9 && dist < 12) {
          e.state = 'WINDUP';
          e.stateTimerMs = e.windupDurationMs;
          e.didHit = false;
          e.telegraph = e.isBoss && Math.random() < 0.35 ? 'UNBLOCKABLE' : 'PARRYABLE';
        } else if (dist < 11) {
          const spd = e.isBoss ? 3.2 : 2.7;
          const nx = e.x + e.facingX * spd * dtSec;
          const ny = e.y + e.facingY * spd * dtSec;
          if (this.canWalk(nx, ny, 0)) {
            e.x = nx;
            e.y = ny;
          }
        }
      } else if (e.state === 'WINDUP') {
        e.stateTimerMs -= dtMs;
        if (e.stateTimerMs <= 0) {
          e.state = 'ACTIVE';
          e.stateTimerMs = 160;
        }
      } else if (e.state === 'ACTIVE') {
        if (!e.didHit) {
          e.didHit = true;
          if (dist <= e.range + 0.35) {
            if (e.telegraph === 'PARRYABLE' && p.parryWindowMs > 0) {
              // 저스트 패링 성공!
              p.qi = Math.min(p.maxQi, p.qi + 35);
              e.poise -= 55;
              this.events.push({ type: 'PARRY_SUCCESS' });
              this.spawnFloat(p.x, p.y, '저스트 패링! +35 내력', '#fbbf24');
              if (e.poise <= 0) {
                e.poise = 0;
                e.state = 'GROGGY';
                e.stateTimerMs = 2400;
                e.telegraph = null;
                continue;
              }
            } else if (p.invulnMs <= 0 && !(e.telegraph === 'UNBLOCKABLE' && p.wz > 0.25)) {
              const dmg = Math.max(4, Math.round(e.attackPower * (100 / (100 + p.defense))));
              p.hp = Math.max(0, p.hp - dmg);
              this.spawnFloat(p.x, p.y, `-${dmg}`, '#f87171');
              if (p.hp <= 0) {
                p.hp = Math.round(p.maxHp * 0.65);
                p.x = this.chapter.spawnX;
                p.y = this.chapter.spawnY;
                this.pushLog('치명상을 입고 챕터 입구에서 회복했습니다.');
              }
            }
          }
        }
        e.stateTimerMs -= dtMs;
        if (e.stateTimerMs <= 0) {
          e.state = 'RECOVER';
          e.stateTimerMs = e.isBoss ? 750 : 900;
          e.telegraph = null;
        }
      } else if (e.state === 'RECOVER') {
        e.stateTimerMs -= dtMs;
        if (e.stateTimerMs <= 0) e.state = 'CHASE';
      }
    }
  }

  private tryInteract(): void {
    const p = this.player;
    // 보물상자 우선 체크
    for (const c of this.chapter.chests) {
      if (this.openedChests.has(c.id)) continue;
      if (Math.hypot(p.x - c.x, p.y - c.y) < 1.8) {
        this.openedChests.add(c.id);
        this.inventory[c.item] = (this.inventory[c.item] ?? 0) + 1;
        this.events.push({ type: 'ITEM_PICKUP', label: c.label });
        this.spawnFloat(c.x, c.y, `+ ${c.label}`, '#fbbf24');
        this.pushLog(`보물상자에서 [${c.label}] 획득!`);
        return;
      }
    }
    // NPC 대화
    for (const npc of this.npcs) {
      if (Math.hypot(p.x - npc.x, p.y - npc.y) < 2.2) {
        this.activeDialogue = {
          lines: npc.dialogue,
          index: 0,
          onComplete: () => {
            if (!npc.talked) {
              npc.talked = true;
              if (npc.rewardArtId !== undefined && !p.unlockedArts.includes(npc.rewardArtId)) {
                p.unlockedArts.push(npc.rewardArtId);
                const art = MARTIAL_ARTS[npc.rewardArtId];
                this.events.push({ type: 'ART_UNLOCKED', name: art.name });
                this.pushLog(`새 무공 [${art.name}] 전수 완료!`);
              }
              if (npc.rewardItem) {
                this.inventory[npc.rewardItem] = (this.inventory[npc.rewardItem] ?? 0) + 1;
                this.events.push({ type: 'ITEM_PICKUP', label: ITEM_LABELS[npc.rewardItem] });
              }
            }
          },
        };
        return;
      }
    }
  }

  public getRenderEntities(): EntityRenderInfo[] {
    const list: EntityRenderInfo[] = [
      {
        id: 'player',
        name: this.player.name,
        role: 'PLAYER',
        x: this.player.x,
        y: this.player.y,
        wz: this.player.wz,
        facingX: this.player.facingX,
        facingY: this.player.facingY,
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        poise: 100,
        maxPoise: 100,
        isMoving: this.player.state === 'WALK',
        isAttacking: this.player.state === 'ACTIVE',
        attackProgress: 1 - Math.max(0, this.player.stateTimerMs) / 160,
        isParrying: this.player.state === 'PARRY',
        isGroggy: false,
      },
    ];

    for (const n of this.npcs) {
      list.push({
        id: n.id,
        name: n.name,
        role: n.role,
        x: n.x,
        y: n.y,
        wz: 0,
        facingX: n.facingX,
        facingY: n.facingY,
        hp: 100,
        maxHp: 100,
        poise: 100,
        maxPoise: 100,
        isMoving: n.isEscort,
        isAttacking: false,
        attackProgress: 0,
        isParrying: false,
        isGroggy: false,
      });
    }

    for (const e of this.enemies) {
      if (e.state === 'DEAD') continue;
      list.push({
        id: e.id,
        name: e.name,
        role: e.role,
        x: e.x,
        y: e.y,
        wz: 0,
        facingX: e.facingX,
        facingY: e.facingY,
        hp: e.hp,
        maxHp: e.maxHp,
        poise: e.poise,
        maxPoise: e.maxPoise,
        isMoving: e.state === 'CHASE',
        isAttacking: e.state === 'ACTIVE',
        attackProgress: 1 - Math.max(0, e.stateTimerMs) / 160,
        isParrying: false,
        isGroggy: e.state === 'GROGGY',
        telegraph: e.state === 'WINDUP' ? e.telegraph : null,
        telegraphProgress: e.state === 'WINDUP' ? 1 - e.stateTimerMs / e.windupDurationMs : 0,
        range: e.range,
      });
    }

    return list;
  }

  public getRenderProjectiles(): ProjectileRenderInfo[] {
    return this.projectiles.map((pr) => ({
      id: pr.id,
      x: pr.x,
      y: pr.y,
      vx: pr.vx,
      vy: pr.vy,
      color: pr.color,
    }));
  }

  public getUIState(): ReadOnlyUIState {
    const boss = this.enemies.find((e) => e.isBoss && e.state !== 'DEAD');
    let nearbyPrompt: string | null = null;
    for (const c of this.chapter.chests) {
      if (!this.openedChests.has(c.id) && Math.hypot(this.player.x - c.x, this.player.y - c.y) < 1.8) {
        nearbyPrompt = `[E / 대화] ${c.label} 상자 열기`;
        break;
      }
    }
    if (!nearbyPrompt) {
      for (const npc of this.npcs) {
        if (Math.hypot(this.player.x - npc.x, this.player.y - npc.y) < 2.2) {
          nearbyPrompt = `[E / 대화] ${npc.name} (${npc.title})`;
          break;
        }
      }
    }

    return {
      chapterId: this.chapter.id,
      chapterTitle: this.chapter.title,
      objective: this.chapter.objective,
      player: {
        name: this.player.name,
        level: this.player.level,
        exp: this.player.exp,
        nextExp: this.player.nextExp,
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        qi: Math.round(this.player.qi),
        maxQi: this.player.maxQi,
        attackPower: this.player.attackPower,
        defense: this.player.defense,
        x: Number(this.player.x.toFixed(1)),
        y: Number(this.player.y.toFixed(1)),
        wz: Number(this.player.wz.toFixed(2)),
        combo: this.player.combo,
        activeArt: this.player.activeArt,
        unlockedArts: [...this.player.unlockedArts],
        cooldownsMs: { ...this.player.cooldownsMs },
        atkBuffMs: this.player.atkBuffMs,
      },
      inventory: { ...this.inventory },
      boss: boss
        ? {
            name: boss.name,
            hp: boss.hp,
            maxHp: boss.maxHp,
            poise: Math.round(boss.poise),
            maxPoise: boss.maxPoise,
            isGroggy: boss.state === 'GROGGY',
          }
        : null,
      dialogue: this.activeDialogue
        ? {
            speaker: this.activeDialogue.lines[this.activeDialogue.index].speaker,
            text: this.activeDialogue.lines[this.activeDialogue.index].text,
            step: this.activeDialogue.index + 1,
            total: this.activeDialogue.lines.length,
          }
        : null,
      nearbyPrompt,
      logs: [...this.logs],
      cutsceneActive: this.cutsceneActive,
      paused: this.paused,
    };
  }
}
