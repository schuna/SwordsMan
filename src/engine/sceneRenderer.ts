import { TILE_H, TILE_W, worldToIso } from './isoMath.js';
import { drawPixelEntity } from './pixelSprites.js';
import { TileAtlas } from './tileAtlas.js';
import { GameWorld } from '../systems/gameWorld.js';

export class SceneRenderer {
  private atlas = new TileAtlas();

  public renderWorld(
    ctx: CanvasRenderingContext2D,
    world: GameWorld,
    canvasW: number,
    canvasH: number,
    timeSec: number
  ): void {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const camIso = worldToIso(world.player.x, world.player.y);
    const offsetX = Math.round(canvasW / 2 - camIso.sx);
    const offsetY = Math.round(canvasH * 0.56 - camIso.sy);

    // 1. 45도 아이소메트릭 타일 (깊이 순 x+y 렌더링, 오프스크린 캐시 drawImage 복사)
    const mapH = world.chapter.mapH;
    const mapW = world.chapter.mapW;
    for (let sum = 0; sum <= mapW + mapH - 2; sum += 1) {
      for (let x = 0; x < mapW; x += 1) {
        const y = sum - x;
        if (y < 0 || y >= mapH) continue;
        const tileKind = world.grid[y][x];
        const iso = worldToIso(x, y);
        const sx = Math.round(iso.sx + offsetX - TILE_W / 2);
        const sy = Math.round(iso.sy + offsetY - TILE_H / 2);
        if (sx < -TILE_W || sx > canvasW + TILE_W || sy < -80 || sy > canvasH + 80) continue;

        const img = this.atlas.getTile(tileKind);
        ctx.drawImage(img, sx, sy - (img.height - TILE_H));

        if (tileKind === 'PORTAL') {
          ctx.fillStyle = 'rgba(186, 230, 253, 0.85)';
          ctx.font = '10px "Malgun Gothic", sans-serif';
          ctx.textAlign = 'center';
          const portal = world.chapter.portals.find((p) => p.x === x && p.y === y);
          if (portal) ctx.fillText(portal.label, sx + TILE_W / 2, sy - 4);
        }
      }
    }

    // 2. 깊이 정렬된 엔티티 렌더링 (x + y 기준)
    const entities = world.getRenderEntities().sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const ent of entities) {
      const iso = worldToIso(ent.x, ent.y);
      drawPixelEntity(ctx, ent, iso.sx + offsetX, iso.sy + offsetY, timeSec);
    }

    // 3. 검기 투사체 렌더링
    for (const pr of world.getRenderProjectiles()) {
      const iso = worldToIso(pr.x, pr.y);
      const px = Math.round(iso.sx + offsetX);
      const py = Math.round(iso.sy + offsetY - 16);
      ctx.save();
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // 4. 플로팅 전투 텍스트
    ctx.save();
    ctx.font = 'bold 12px "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    for (const ft of world.floatingTexts) {
      const iso = worldToIso(ft.x, ft.y);
      const progress = 1 - ft.ttlMs / ft.maxTtlMs;
      const fx = Math.round(iso.sx + offsetX);
      const fy = Math.round(iso.sy + offsetY - 46 - progress * 24);
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.fillStyle = '#000000';
      ctx.fillText(ft.text, fx + 1, fy + 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, fx, fy);
    }
    ctx.restore();
  }

  public renderMinimap(ctx: CanvasRenderingContext2D, world: GameWorld, w: number, h: number): void {
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, w, h);
    const cellW = w / world.chapter.mapW;
    const cellH = h / world.chapter.mapH;

    for (let y = 0; y < world.chapter.mapH; y += 1) {
      for (let x = 0; x < world.chapter.mapW; x += 1) {
        const t = world.grid[y][x];
        if (t === 'WALL_RED' || t === 'BAMBOO' || t === 'PLUM_TREE') ctx.fillStyle = '#334155';
        else if (t === 'WATER') ctx.fillStyle = '#1d4ed8';
        else if (t === 'PORTAL') ctx.fillStyle = '#38bdf8';
        else if (t === 'CHEST') ctx.fillStyle = '#f59e0b';
        else ctx.fillStyle = '#1e293b';
        ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }

    for (const e of world.enemies) {
      if (e.state === 'DEAD') continue;
      ctx.fillStyle = e.isBoss ? '#f43f5e' : '#fb7185';
      ctx.fillRect(e.x * cellW - 2, e.y * cellH - 2, 4, 4);
    }
    for (const n of world.npcs) {
      ctx.fillStyle = '#34d399';
      ctx.fillRect(n.x * cellW - 2, n.y * cellH - 2, 4, 4);
    }
    ctx.fillStyle = '#facc15';
    ctx.fillRect(world.player.x * cellW - 3, world.player.y * cellH - 3, 6, 6);
  }
}
