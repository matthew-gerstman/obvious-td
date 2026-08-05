import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  DifficultyConfig,
  DifficultyMode,
  EnemyData,
  EnemyLogic,
  MapData,
  TowerData,
  WaveTable,
} from '../../../src/logic/types';

function loadJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export function loadDifficultyConfig(): DifficultyConfig {
  return loadJson('data/difficulty.json') as DifficultyConfig;
}

export function loadDifficultyMode(mode: 'easy' | 'medium' | 'hard'): DifficultyMode {
  const config = loadDifficultyConfig();
  if (mode === 'easy') return config.modes.easy;
  if (mode === 'medium') return config.modes.medium;
  return config.modes.hard;
}

export function loadEnemyData(): Record<string, EnemyLogic> {
  const dir = 'data/archetypes';
  const files = readdirSync(dir).filter((f) => f.startsWith('enemy_') && f.endsWith('.json'));
  const result: Record<string, EnemyLogic> = {};
  for (const file of files) {
    const data = loadJson(join(dir, file)) as EnemyData;
    result[data.id] = data.logic;
  }
  return result;
}

export function loadTowerData(): TowerData[] {
  const dir = 'data/archetypes';
  const files = readdirSync(dir).filter((f) => f.startsWith('tower_') && f.endsWith('.json'));
  return files.map((f) => loadJson(join(dir, f)) as TowerData);
}

export function loadWaveTable(): WaveTable {
  return loadJson('data/waves/wave_table.json') as WaveTable;
}

export function loadMap(mapId: string): MapData {
  return loadJson(`data/maps/${mapId}.json`) as MapData;
}

