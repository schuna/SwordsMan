import { SaveSlotData } from './types.js';

const STORAGE_PREFIX = 'swordsman_v5_slot_';

export class SaveManager {
  public save(slot: string, data: SaveSlotData): boolean {
    try {
      localStorage.setItem(STORAGE_PREFIX + slot, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  public load(slot: string): SaveSlotData | null {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + slot);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SaveSlotData;
      if (!parsed || typeof parsed.chapterId !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  public hasSlot(slot: string): boolean {
    try {
      return localStorage.getItem(STORAGE_PREFIX + slot) !== null;
    } catch {
      return false;
    }
  }
}
