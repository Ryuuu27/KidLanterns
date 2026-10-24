export enum GameState {
  TitleMenu = 'TITLE_MENU',
  Playing = 'PLAYING',
  Paused = 'PAUSED',
  RoundSummary = 'ROUND_SUMMARY',
  Victory = 'VICTORY',
  GameOver = 'GAME_OVER',
}

export enum PlayMode {
  Coop2P = 'COOP_2P',
  SoloCompanion = 'SOLO_COMPANION',
}

export enum LanternKind {
  Shared = 'SHARED',
  Sun = 'SUN',
  Moon = 'MOON',
  SealedHeart = 'SEALED_HEART',
}

export enum EnemyKind {
  ShadeMote = 'SHADE_MOTE',
  RiftStalker = 'RIFT_STALKER',
  GloomMortar = 'GLOOM_MORTAR',
  EclipseWeaver = 'ECLIPSE_WEAVER',
}

export enum EnemyPhase {
  Drifting = 'DRIFTING',
  Windup = 'WINDUP',
  Lunging = 'LUNGING',
  Recovering = 'RECOVERING',
}

export interface CoupleNames {
  sol: string;
  luna: string;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface StonePlatformDef {
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
}

export interface LanternDef {
  id: string;
  x: number;
  y: number;
  kind: LanternKind;
}

export interface SealPairDef {
  id: string;
  sunX: number;
  sunY: number;
  moonX: number;
  moonY: number;
  unlocksLanternId: string;
}

export interface PrismPillarDef {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface WaveSpawnDef {
  delay: number;
  kind: EnemyKind;
  count: number;
}

export interface SanctuaryDef {
  index: number;
  title: string;
  subtitle: string;
  objectiveHint: string;
  coupleSparkPrompt: string;
  worldWidth: number;
  worldHeight: number;
  solStart: Vec2;
  lunaStart: Vec2;
  platforms: StonePlatformDef[];
  lanterns: LanternDef[];
  sealPairs: SealPairDef[];
  pillars: PrismPillarDef[];
  waves: WaveSpawnDef[];
}

export interface RoundStats {
  sanctuaryIndex: number;
  sanctuaryTitle: string;
  coupleSparkPrompt: string;
  scoreGained: number;
  totalScore: number;
  tetherSlices: number;
  resonanceNovas: number;
  partnerSaves: number;
  embraceSeconds: number;
  clearTimeSeconds: number;
  heartsRemaining: number;
  maxHearts: number;
}

export interface HudSnapshot {
  gameState: GameState;
  playMode: PlayMode;
  hearts: number;
  maxHearts: number;
  harmonyPips: number; // 0..3 -> 3 restores 1 heart
  sanctuaryIndex: number;
  totalSanctuaries: number;
  sanctuaryTitle: string;
  objectiveHint: string;
  lanternsLit: number;
  totalLanterns: number;
  enemiesRemaining: number;
  bossHpRatio: number | null;
  bossName: string | null;
  score: number;
  syncStreak: number;
  isMuted: boolean;
  roundStats: RoundStats | null;
}
