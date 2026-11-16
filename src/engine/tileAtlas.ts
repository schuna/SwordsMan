import { TILE_H, TILE_W } from './isoMath.js';
import { TileKind } from '../systems/types.js';

/**
 * 1993 MS-DOS VGA 256색 감성의 45도 아이소메트릭 오프스크린 타일 캐시
 * 초기화 시 1회만 생성하여 drawImage로 복사하므로 CPU + 내장 GPU 환경에서도 60fps 유지
 */
export class TileAtlas {
  private cache = new Map<TileKind, HTMLCanvasElement>();

  constructor() {
    const kinds: TileKind[] = [
      'STONE',
      'WOOD',
      'DIRT',
      'GRASS',
      'WATER',
      'BRIDGE',
      'WALL_RED',
      'BAMBOO',
      'ROCK',
      'PORTAL',
      'PLUM_TREE',
      'CHEST',
    ];
    for (const k of kinds) {
      this.cache.set(k, this.bakeTile(k));
    }
  }

  public getTile(kind: TileKind): HTMLCanvasElement {
    return this.cache.get(kind) ?? this.cache.get('STONE')!;
  }

  private createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    return [c, ctx];
  }

  private drawDiamond(
    ctx: CanvasRenderingContext2D,
    fill: string,
    stroke: string,
    offsetY = 0
  ): void {
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    ctx.beginPath();
    ctx.moveTo(hw, offsetY);
    ctx.lineTo(TILE_W, hh + offsetY);
    ctx.lineTo(hw, TILE_H + offsetY);
    ctx.lineTo(0, hh + offsetY);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private bakeTile(kind: TileKind): HTMLCanvasElement {
    const isTall =
      kind === 'WALL_RED' ||
      kind === 'BAMBOO' ||
      kind === 'PLUM_TREE' ||
      kind === 'ROCK' ||
      kind === 'CHEST';
    const h = isTall ? 72 : 36;
    const [canvas, ctx] = this.createCanvas(TILE_W, h);
    const oy = isTall ? 40 : 0;

    if (kind === 'STONE') {
      this.drawDiamond(ctx, '#475569', '#334155', oy);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(24, 10, 5, 2);
      ctx.fillRect(38, 17, 4, 2);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(29, 21, 5, 2);
    } else if (kind === 'WOOD') {
      this.drawDiamond(ctx, '#78350f', '#451a03', oy);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(18, 12, 26, 2);
      ctx.fillRect(14, 18, 34, 2);
      ctx.fillStyle = '#451a03';
      ctx.fillRect(28, 8, 2, 16);
    } else if (kind === 'DIRT') {
      this.drawDiamond(ctx, '#6b4c35', '#4a3322', oy);
      ctx.fillStyle = '#855f42';
      ctx.fillRect(22, 14, 4, 2);
      ctx.fillRect(36, 19, 3, 2);
    } else if (kind === 'GRASS') {
      this.drawDiamond(ctx, '#2f5e38', '#1e4226', oy);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(22, 12, 2, 3);
      ctx.fillRect(36, 16, 2, 3);
      ctx.fillRect(30, 21, 2, 2);
    } else if (kind === 'WATER') {
      this.drawDiamond(ctx, '#1e40af', '#1e3a8a', oy);
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(20, 12, 10, 2);
      ctx.fillRect(32, 19, 8, 2);
    } else if (kind === 'BRIDGE') {
      this.drawDiamond(ctx, '#92400e', '#451a03', oy);
      ctx.fillStyle = '#b45309';
      for (let i = 0; i < 4; i += 1) {
        ctx.fillRect(16 + i * 8, 10 + i * 2, 5, 10);
      }
    } else if (kind === 'PORTAL') {
      this.drawDiamond(ctx, '#312e81', '#6366f1', oy);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.ellipse(TILE_W / 2, oy + TILE_H / 2, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(30, oy + 14, 4, 4);
    } else if (kind === 'WALL_RED') {
      this.drawDiamond(ctx, '#334155', '#1e293b', oy);
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(10, 14, 44, 38);
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(14, 18, 36, 30);
      // 기와 지붕
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(6, 6, 52, 10);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(8, 14, 48, 2);
    } else if (kind === 'BAMBOO') {
      this.drawDiamond(ctx, '#2f5e38', '#1e4226', oy);
      const stems = [22, 31, 40];
      for (const sx of stems) {
        ctx.fillStyle = '#15803d';
        ctx.fillRect(sx, 8, 4, 46);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(sx + 1, 16, 4, 1);
        ctx.fillRect(sx + 1, 28, 4, 1);
        ctx.fillRect(sx + 1, 40, 4, 1);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(sx - 4, 6, 12, 6);
      }
    } else if (kind === 'PLUM_TREE') {
      this.drawDiamond(ctx, '#475569', '#334155', oy);
      ctx.fillStyle = '#5c3a21';
      ctx.fillRect(28, 26, 8, 28);
      ctx.fillStyle = '#be123c';
      ctx.beginPath();
      ctx.arc(32, 20, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(22, 12, 6, 5);
      ctx.fillRect(34, 16, 7, 5);
      ctx.fillRect(27, 23, 6, 4);
    } else if (kind === 'ROCK') {
      this.drawDiamond(ctx, '#6b4c35', '#4a3322', oy);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(16, 28, 32, 24);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(20, 24, 22, 14);
      ctx.fillStyle = '#475569';
      ctx.fillRect(34, 34, 14, 18);
    } else if (kind === 'CHEST') {
      this.drawDiamond(ctx, '#475569', '#334155', oy);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(18, 34, 28, 18);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(18, 34, 28, 4);
      ctx.fillRect(29, 38, 6, 6);
    }

    return canvas;
  }
}
