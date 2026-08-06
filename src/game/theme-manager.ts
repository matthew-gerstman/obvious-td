import type { TowerData, EnemyData, ThemeData } from '../logic/types';

const STORAGE_KEY = 'td-theme';
const DEFAULT_THEME = 'demons-heaven';
const PATH_TILE_KEYS = ['h', 'v', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw'] as const;

/**
 * Loads theme JSON, merges overrides into archetype presentation,
 * resolves sprite paths for preloading, and persists theme choice.
 * Logic blocks are never touched — only presentation fields.
 */
export class ThemeManager {
  /** Fetch a theme JSON file. Returns null if missing or invalid. */
  async loadTheme(themeId: string): Promise<ThemeData | null> {
    try {
      const res = await fetch(`/data/themes/${themeId}.json`);
      if (!res.ok) return null;
      return (await res.json()) as ThemeData;
    } catch {
      return null;
    }
  }

  /**
   * Merge theme overrides into archetype presentation.
   * For each entity whose id matches an override key, replace the
   * matching presentation fields. Logic blocks are never touched.
   * Returns new objects — originals are not mutated.
   */
  applyOverrides<T extends { id: string; presentation?: object }>(
    archetypes: T[],
    themeData: ThemeData | null,
  ): T[] {
    if (!themeData?.overrides) return archetypes;
    return archetypes.map((archetype) => {
      const override = themeData.overrides[archetype.id];
      if (!override) return archetype;
      return {
        ...archetype,
        presentation: { ...archetype.presentation, ...override },
      };
    });
  }

  /**
   * Collect all sprite paths from themed archetype data plus
   * themed path tile paths for preloading.
   */
  resolveSpritePaths(
    towers: TowerData[],
    enemies: Record<string, EnemyData>,
    themeData: ThemeData | null,
  ): string[] {
    const paths = new Set<string>();

    for (const tower of towers) {
      if (tower.presentation?.sprite) paths.add(tower.presentation.sprite);
      if (tower.presentation?.projectileSprite) paths.add(tower.presentation.projectileSprite);
    }

    for (const enemyId in enemies) {
      const enemy = enemies[enemyId];
      if (enemy.presentation?.sprite) paths.add(enemy.presentation.sprite);
    }

    const dir = themeData?.ui?.pathTiles?.spriteDir ?? 'sprites/default';
    for (const key of PATH_TILE_KEYS) {
      paths.add(`${dir}/path_tile_${key}.png`);
    }

    return [...paths];
  }

  /** Persist the selected theme ID to localStorage. */
  saveTheme(themeId: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, themeId);
    } catch {
      // localStorage may be unavailable in some environments
    }
  }

  /** Read the saved theme ID, defaulting to 'demons-heaven'. */
  loadSavedTheme(): string {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  }
}

