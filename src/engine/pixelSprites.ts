import { EntityRenderInfo, SpriteRole } from '../systems/types.js';

const ROLE_PALETTE: Record<
  SpriteRole,
  { robe: string; sash: string; hair: string; skin: string; sword: string }
> = {
  PLAYER: { robe: '#2563eb', sash: '#f8fafc', hair: '#0f172a', skin: '#fcd34d', sword: '#e2e8f0' },
  ELDER: { robe: '#cbd5e1', sash: '#facc15', hair: '#f8fafc', skin: '#fde68a', sword: '#fde047' },
  MASTER: { robe: '#4c1d95', sash: '#e2e8f0', hair: '#1e293b', skin: '#fde68a', sword: '#cbd5e1' },
  ALLY_HEROINE: { robe: '#ec4899', sash: '#fef08a', hair: '#0f172a', skin: '#fde68a', sword: '#e2e8f0' },
  ESCORT: { robe: '#0d9488', sash: '#fef08a', hair: '#1e293b', skin: '#fde68a', sword: '#94a3b8' },
  INNKEEPER: { robe: '#0284c7', sash: '#fb7185', hair: '#1e293b', skin: '#fde68a', sword: '' },
  SCHOLAR: { robe: '#0f766e', sash: '#fde047', hair: '#334155', skin: '#fde68a', sword: '' },
  ENEMY_RAIDER: { robe: '#334155', sash: '#dc2626', hair: '#0f172a', skin: '#d6d3d1', sword: '#94a3b8' },
  ENEMY_ELITE: { robe: '#581c87', sash: '#f59e0b', hair: '#0f172a', skin: '#e7e5e4', sword: '#c084fc' },
  BOSS_CRIMSON: { robe: '#be123c', sash: '#facc15', hair: '#09090b', skin: '#fef08a', sword: '#fde047' },
};

export function drawPixelEntity(
  ctx: CanvasRenderingContext2D,
  ent: EntityRenderInfo,
  screenX: number,
  screenY: number,
  animTime: number
): void {
  const pal = ROLE_PALETTE[ent.role];
  const sx = Math.round(screenX);
  const sy = Math.round(screenY);
  const jumpPx = Math.round(ent.wz * 28);

  // 보스 공격 텔레그래프 장판 (적색 패링 가능 / 자색 회피 전용)
  if (ent.telegraph && ent.range) {
    const rad = ent.range * 26;
    const isParryable = ent.telegraph === 'PARRYABLE';
    ctx.save();
    ctx.strokeStyle = isParryable ? 'rgba(239, 68, 68, 0.9)' : 'rgba(168, 85, 247, 0.9)';
    ctx.fillStyle = isParryable ? 'rgba(239, 68, 68, 0.16)' : 'rgba(168, 85, 247, 0.18)';
    ctx.lineWidth = 2;
    if (!isParryable) ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.ellipse(sx, sy, rad, rad * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 진행도 내부 원
    const p = Math.max(0, Math.min(1, ent.telegraphProgress ?? 0));
    ctx.beginPath();
    ctx.ellipse(sx, sy, rad * p, rad * 0.52 * p, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  // 지상 그림자 (경공 도약 시 크기 축소)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.44)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 2, ent.wz > 0.08 ? 9 : 13, ent.wz > 0.08 ? 4 : 6, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyY = sy - jumpPx;
  const walkBob = ent.isMoving && ent.wz <= 0.05 ? Math.round(Math.sin(animTime * 14) * 2) : 0;
  const legSwing = ent.isMoving && ent.wz <= 0.05 ? Math.round(Math.sin(animTime * 14) * 3) : 0;
  const dirSign = ent.facingX - ent.facingY >= 0 ? 1 : -1;
  const scale = ent.role === 'BOSS_CRIMSON' ? 1.28 : 1.0;

  ctx.translate(sx, bodyY + walkBob);
  ctx.scale(scale, scale);

  // 다리
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-5, -10 + legSwing, 4, 10);
  ctx.fillRect(1, -10 - legSwing, 4, 10);

  // 도포 몸통
  ctx.fillStyle = pal.robe;
  ctx.fillRect(-8, -26, 16, 17);
  // 허리띠
  ctx.fillStyle = pal.sash;
  ctx.fillRect(-8, -16, 16, 3);

  // 등 뒤 검집
  if (pal.sword) {
    ctx.fillStyle = '#475569';
    ctx.fillRect(-dirSign * 7 - 1, -30, 3, 16);
  }

  // 머리 & 상투
  ctx.fillStyle = pal.skin;
  ctx.fillRect(-5, -36, 10, 10);
  ctx.fillStyle = pal.hair;
  ctx.fillRect(-6, -38, 12, 4);
  ctx.fillRect(-2, -41, 4, 4);

  // 눈
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(dirSign > 0 ? 1 : -3, -32, 2, 2);

  // 패링 방어막
  if (ent.isParrying) {
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -20, 18, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 검격 모션
  if (ent.isAttacking && pal.sword) {
    const p = ent.attackProgress;
    const angle = -1.1 + p * 2.2;
    ctx.save();
    ctx.translate(dirSign * 6, -20);
    ctx.rotate(dirSign * angle);
    ctx.fillStyle = pal.sword;
    ctx.fillRect(0, -2, 20, 3);
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 21, -0.5, 0.5);
    ctx.stroke();
    ctx.restore();
  }

  // 그로기 표시
  if (ent.isGroggy) {
    ctx.fillStyle = '#facc15';
    const ox = Math.round(Math.cos(animTime * 8) * 7);
    ctx.fillRect(ox - 2, -46, 4, 4);
    ctx.fillRect(-ox - 2, -46, 4, 4);
  }

  ctx.restore();

  // 이름표 & HP바
  const isEnemy = ent.role === 'ENEMY_RAIDER' || ent.role === 'ENEMY_ELITE' || ent.role === 'BOSS_CRIMSON';
  if (ent.role !== 'PLAYER') {
    ctx.save();
    ctx.font = '11px "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isEnemy ? '#fca5a5' : '#fde68a';
    ctx.fillText(ent.name, sx, bodyY - 46 * scale);
    if (isEnemy && ent.maxHp > 0) {
      const ratio = Math.max(0, Math.min(1, ent.hp / ent.maxHp));
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(sx - 18, bodyY - 43 * scale, 36, 4);
      ctx.fillStyle = ent.isGroggy ? '#facc15' : '#ef4444';
      ctx.fillRect(sx - 18, bodyY - 43 * scale, Math.round(36 * ratio), 4);
    }
    ctx.restore();
  }
}
