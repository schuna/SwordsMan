export const TILE_W = 64;
export const TILE_H = 32;

export function worldToIso(wx: number, wy: number): { sx: number; sy: number } {
  return {
    sx: (wx - wy) * (TILE_W / 2),
    sy: (wx + wy) * (TILE_H / 2),
  };
}

export function isoToWorld(sx: number, sy: number): { wx: number; wy: number } {
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  return {
    wx: (sx / hw + sy / hh) / 2,
    wy: (sy / hh - sx / hw) / 2,
  };
}
