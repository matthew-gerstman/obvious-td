import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThemeManager } from '../../src/game/theme-manager';
import type { TowerData, EnemyData, ThemeData } from '../../src/logic/types';

describe('ThemeManager', () => {
  let tm: ThemeManager;
  let fetchMock: ReturnType<typeof vi.fn>;
  let storage: Record<string, string>;

  beforeEach(() => {
    tm = new ThemeManager();
    fetchMock = vi.fn();
    storage = {};

    // Mock fetch
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete storage[key];
      }),
      clear: vi.fn(() => {
        storage = {};
      }),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadTheme', () => {
    it('fetches and returns theme JSON on success', async () => {
      const mockTheme: ThemeData = {
        theme: 'dragon-ball',
        overrides: {},
        ui: { pathTiles: { spriteDir: 'sprites/dragon-ball' } },
      };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTheme,
      });

      const result = await tm.loadTheme('dragon-ball');
      expect(result).toEqual(mockTheme);
      expect(fetchMock).toHaveBeenCalledWith('/data/themes/dragon-ball.json');
    });

    it('returns null when fetch fails', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));
      const result = await tm.loadTheme('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null when response is not ok', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
      const result = await tm.loadTheme('missing');
      expect(result).toBeNull();
    });
  });

  describe('applyOverrides', () => {
    const mockTowers: TowerData[] = [
      {
        id: 'tower_gatling',
        archetype: 'gatling',
        logic: { cost: 50, damage: 5, range: 2, fireRate: 4, projectileSpeed: 8 },
        presentation: {
          name: 'Gatling Tower',
          description: 'Rapid-fire turret.',
          sprite: 'sprites/default/gatling.png',
          projectileSprite: 'sprites/default/gatling_projectile.png',
        },
      },
      {
        id: 'tower_cannon',
        archetype: 'cannon',
        logic: { cost: 100, damage: 20, range: 3, fireRate: 1, projectileSpeed: 4, splash: 1 },
        presentation: {
          name: 'Cannon Tower',
          description: 'Heavy cannon.',
          sprite: 'sprites/default/cannon.png',
        },
      },
    ];

    const mockTheme: ThemeData = {
      theme: 'dragon-ball',
      overrides: {
        tower_gatling: {
          name: 'Ki Blast Turret',
          sprite: 'sprites/dragon-ball/gatling.png',
        },
      },
    };

    it('merges override fields into presentation', () => {
      const result = tm.applyOverrides(mockTowers, mockTheme);
      expect(result[0].presentation.name).toBe('Ki Blast Turret');
      expect(result[0].presentation.sprite).toBe('sprites/dragon-ball/gatling.png');
    });

    it('preserves non-overridden presentation fields', () => {
      const result = tm.applyOverrides(mockTowers, mockTheme);
      expect(result[0].presentation.description).toBe('Rapid-fire turret.');
      expect(result[0].presentation.projectileSprite).toBe('sprites/default/gatling_projectile.png');
    });

    it('does not touch logic blocks', () => {
      const result = tm.applyOverrides(mockTowers, mockTheme);
      expect(result[0].logic).toEqual(mockTowers[0].logic);
      expect(result[1].logic).toEqual(mockTowers[1].logic);
    });

    it('returns new objects — originals not mutated', () => {
      const result = tm.applyOverrides(mockTowers, mockTheme);
      expect(result[0]).not.toBe(mockTowers[0]);
      expect(result[0].presentation).not.toBe(mockTowers[0].presentation);
      // Originals unchanged
      expect(mockTowers[0].presentation.name).toBe('Gatling Tower');
    });

    it('passes through archetypes with no override unchanged', () => {
      const result = tm.applyOverrides(mockTowers, mockTheme);
      // tower_cannon has no override — should be the same reference
      expect(result[1]).toBe(mockTowers[1]);
    });

    it('returns originals when themeData is null', () => {
      const result = tm.applyOverrides(mockTowers, null);
      expect(result).toBe(mockTowers);
    });

    it('returns same element references when themeData has empty overrides', () => {
      const result = tm.applyOverrides(mockTowers, { theme: 'empty', overrides: {} });
      expect(result).toHaveLength(mockTowers.length);
      expect(result[0]).toBe(mockTowers[0]);
      expect(result[1]).toBe(mockTowers[1]);
    });
  });

  describe('resolveSpritePaths', () => {
    const mockTowers: TowerData[] = [
      {
        id: 'tower_gatling',
        archetype: 'gatling',
        logic: { cost: 50, damage: 5, range: 2, fireRate: 4, projectileSpeed: 8 },
        presentation: {
          name: 'Ki Blast Turret',
          description: '',
          sprite: 'sprites/dragon-ball/gatling.png',
          projectileSprite: 'sprites/dragon-ball/gatling_projectile.png',
        },
      },
    ];

    const mockEnemies: Record<string, EnemyData> = {
      enemy_runner: {
        id: 'enemy_runner',
        logic: { baseHP: 50, speed: 2, flying: false, goldReward: 5, isBoss: false },
        presentation: {
          name: 'Saibaman',
          description: '',
          sprite: 'sprites/dragon-ball/runner.png',
        },
      },
    };

    const mockTheme: ThemeData = {
      theme: 'dragon-ball',
      overrides: {},
      ui: { pathTiles: { spriteDir: 'sprites/dragon-ball' } },
    };

    it('collects tower sprite and projectile paths', () => {
      const paths = tm.resolveSpritePaths(mockTowers, mockEnemies, mockTheme);
      expect(paths).toContain('sprites/dragon-ball/gatling.png');
      expect(paths).toContain('sprites/dragon-ball/gatling_projectile.png');
    });

    it('collects enemy sprite paths', () => {
      const paths = tm.resolveSpritePaths(mockTowers, mockEnemies, mockTheme);
      expect(paths).toContain('sprites/dragon-ball/runner.png');
    });

    it('includes themed path tile paths', () => {
      const paths = tm.resolveSpritePaths(mockTowers, mockEnemies, mockTheme);
      expect(paths).toContain('sprites/dragon-ball/path_tile_h.png');
      expect(paths).toContain('sprites/dragon-ball/path_tile_v.png');
      expect(paths).toContain('sprites/dragon-ball/path_tile_corner_ne.png');
      expect(paths).toContain('sprites/dragon-ball/path_tile_corner_nw.png');
      expect(paths).toContain('sprites/dragon-ball/path_tile_corner_se.png');
      expect(paths).toContain('sprites/dragon-ball/path_tile_corner_sw.png');
    });

    it('defaults to sprites/default when no theme pathTiles', () => {
      const paths = tm.resolveSpritePaths(mockTowers, mockEnemies, null);
      expect(paths).toContain('sprites/default/path_tile_h.png');
    });
  });

  describe('saveTheme / loadSavedTheme', () => {
    it('saves theme ID to localStorage', () => {
      tm.saveTheme('dragon-ball');
      expect(storage['td-theme']).toBe('dragon-ball');
    });

    it('loads saved theme ID', () => {
      storage['td-theme'] = 'dragon-ball';
      expect(tm.loadSavedTheme()).toBe('dragon-ball');
    });

    it('defaults to demons-heaven when nothing saved', () => {
      expect(tm.loadSavedTheme()).toBe('demons-heaven');
    });

    it('handles localStorage errors gracefully on save', () => {
      Object.defineProperty(globalThis, 'localStorage', {
        value: { setItem: () => { throw new Error('Quota exceeded'); } },
        writable: true,
        configurable: true,
      });
      // Should not throw
      tm.saveTheme('dragon-ball');
    });

    it('handles localStorage errors gracefully on load', () => {
      Object.defineProperty(globalThis, 'localStorage', {
        value: { getItem: () => { throw new Error('Unavailable'); } },
        writable: true,
        configurable: true,
      });
      expect(tm.loadSavedTheme()).toBe('demons-heaven');
    });
  });
});

