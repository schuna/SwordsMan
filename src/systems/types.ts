export type TileKind =
  | 'STONE'
  | 'WOOD'
  | 'DIRT'
  | 'GRASS'
  | 'WATER'
  | 'BRIDGE'
  | 'WALL_RED'
  | 'BAMBOO'
  | 'ROCK'
  | 'PORTAL'
  | 'PLUM_TREE'
  | 'CHEST';

export type SpriteRole =
  | 'PLAYER'
  | 'ELDER'
  | 'MASTER'
  | 'ALLY_HEROINE'
  | 'ESCORT'
  | 'INNKEEPER'
  | 'SCHOLAR'
  | 'ENEMY_RAIDER'
  | 'ENEMY_ELITE'
  | 'BOSS_CRIMSON';

export type MartialArtId = 0 | 1 | 2 | 3 | 4;

export interface MartialArtSpec {
  id: MartialArtId;
  name: string;
  hanja: string;
  desc: string;
  qiCost: number;
  cooldownMs: number;
  windupMs: number;
  activeMs: number;
  recoveryMs: number;
  skillMult: number;
  poiseDamage: number;
  range: number;
  kind: 'MELEE' | 'PROJECTILE' | 'DRAIN_AOE' | 'HEAL_BUFF';
  color: string;
}

export interface DialogueLine {
  speaker: string;
  role: SpriteRole;
  text: string;
}

export interface NpcSpawnDef {
  id: string;
  name: string;
  title: string;
  role: SpriteRole;
  x: number;
  y: number;
  isEscort?: boolean;
  dialogue: DialogueLine[];
  rewardArtId?: MartialArtId;
  rewardItem?: ItemKind;
  advanceToChapter?: number;
}

export interface EnemySpawnDef {
  id: string;
  name: string;
  role: SpriteRole;
  kind: 'RAIDER' | 'ELITE' | 'BOSS';
  x: number;
  y: number;
  maxHp: number;
  attackPower: number;
  defense: number;
  maxPoise: number;
  expReward: number;
  isBoss?: boolean;
  onDefeatDialogue?: DialogueLine[];
  unlocksPortal?: boolean;
  triggersEnding?: EndingId;
}

export interface ChestSpawnDef {
  id: string;
  x: number;
  y: number;
  item: ItemKind;
  label: string;
}

export interface PortalDef {
  x: number;
  y: number;
  targetChapter: number;
  targetX: number;
  targetY: number;
  label: string;
  requiresBossClear?: boolean;
}

export type ChapterTheme = 'MOUNTAIN' | 'INN' | 'FOREST' | 'MANOR' | 'CAVE' | 'PLUM_HALL';

export interface ChapterDef {
  id: number;
  code: string;
  title: string;
  subtitle: string;
  theme: ChapterTheme;
  mapW: number;
  mapH: number;
  spawnX: number;
  spawnY: number;
  objective: string;
  npcs: NpcSpawnDef[];
  enemies: EnemySpawnDef[];
  chests: ChestSpawnDef[];
  portals: PortalDef[];
  introDialogue?: DialogueLine[];
}

export type ItemKind = 'HP_POTION' | 'QI_PILL' | 'ATK_ELIXIR' | 'SECRET_KEY';

export type EndingId = 'em1' | 'em2' | 'em3' | 'd9';

export interface EndingDef {
  id: EndingId;
  title: string;
  subtitle: string;
  lines: string[];
  accentColor: string;
}

export type PlayerActionState = 'IDLE' | 'WALK' | 'JUMP' | 'WINDUP' | 'ACTIVE' | 'RECOVER' | 'PARRY';

export interface InputSnapshot {
  moveX: number;
  moveY: number;
  attackPressed: boolean;
  parryPressed: boolean;
  jumpPressed: boolean;
  interactPressed: boolean;
  skillSlotPressed: MartialArtId | null;
}

export interface EntityRenderInfo {
  id: string;
  name: string;
  role: SpriteRole;
  x: number;
  y: number;
  wz: number;
  facingX: number;
  facingY: number;
  hp: number;
  maxHp: number;
  poise: number;
  maxPoise: number;
  isMoving: boolean;
  isAttacking: boolean;
  attackProgress: number;
  isParrying: boolean;
  isGroggy: boolean;
  telegraph?: 'PARRYABLE' | 'UNBLOCKABLE' | null;
  telegraphProgress?: number;
  range?: number;
}

export interface ProjectileRenderInfo {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  ttlMs: number;
  maxTtlMs: number;
}

export type CombatEvent =
  | { type: 'PLAYER_HIT'; damage: number; isCrit: boolean; isGroggy: boolean }
  | { type: 'PARRY_SUCCESS' }
  | { type: 'BOSS_GROGGY' }
  | { type: 'LEVEL_UP'; level: number }
  | { type: 'ITEM_PICKUP'; label: string }
  | { type: 'ART_UNLOCKED'; name: string }
  | { type: 'CHAPTER_CHANGED'; title: string }
  | { type: 'ENDING_TRIGGERED'; endingId: EndingId }
  | { type: 'LOG'; message: string };

export interface ReadOnlyUIState {
  chapterId: number;
  chapterTitle: string;
  objective: string;
  player: {
    name: string;
    level: number;
    exp: number;
    nextExp: number;
    hp: number;
    maxHp: number;
    qi: number;
    maxQi: number;
    attackPower: number;
    defense: number;
    x: number;
    y: number;
    wz: number;
    combo: number;
    activeArt: MartialArtId;
    unlockedArts: MartialArtId[];
    cooldownsMs: Record<MartialArtId, number>;
    atkBuffMs: number;
  };
  inventory: Record<ItemKind, number>;
  boss: {
    name: string;
    hp: number;
    maxHp: number;
    poise: number;
    maxPoise: number;
    isGroggy: boolean;
  } | null;
  dialogue: {
    speaker: string;
    text: string;
    step: number;
    total: number;
  } | null;
  nearbyPrompt: string | null;
  logs: string[];
  cutsceneActive: boolean;
  paused: boolean;
}

export interface SaveSlotData {
  version: number;
  savedAt: string;
  chapterId: number;
  playerX: number;
  playerY: number;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  activeArt: MartialArtId;
  unlockedArts: MartialArtId[];
  inventory: Record<ItemKind, number>;
  clearedChapters: number[];
  openedChests: string[];
}
