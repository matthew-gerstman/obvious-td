import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';

const SCHEMAS_DIR = 'schemas';
const DATA_ARCHETYPES_DIR = 'public/data/archetypes';
const DATA_MAPS_DIR = 'public/data/maps';
const DATA_THEMES_DIR = 'public/data/themes';
const DATA_WAVES_DIR = 'public/data/waves';
const FIXTURES_DIR = 'tests/fixtures';

const ajv = new Ajv({ allErrors: true, strict: true });

function loadJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function compileSchema(name: string) {
  return ajv.compile(loadJson(join(SCHEMAS_DIR, `${name}.schema.json`)) as object);
}

describe('Schema validation — all data files validate clean', () => {
  it('all 7 tower files validate against tower schema', () => {
    const validate = compileSchema('tower');
    const files = readdirSync(DATA_ARCHETYPES_DIR)
      .filter(file => file.startsWith('tower_') && file.endsWith('.json'));
    expect(files).toHaveLength(7);
    for (const file of files) {
      const data = loadJson(join(DATA_ARCHETYPES_DIR, file));
      if (!validate(data)) {
        console.error(`${file}:`, validate.errors);
      }
      expect(validate(data)).toBe(true);
    }
  });

  it('all 6 enemy files validate against enemy schema', () => {
    const validate = compileSchema('enemy');
    const files = readdirSync(DATA_ARCHETYPES_DIR)
      .filter(file => file.startsWith('enemy_') && file.endsWith('.json'));
    expect(files).toHaveLength(6);
    for (const file of files) {
      const data = loadJson(join(DATA_ARCHETYPES_DIR, file));
      expect(validate(data)).toBe(true);
    }
  });

  it('all 3 map files validate against map schema', () => {
    const validate = compileSchema('map');
    const files = readdirSync(DATA_MAPS_DIR)
      .filter(file => file.startsWith('map_') && file.endsWith('.json'));
    expect(files).toHaveLength(3);
    for (const file of files) {
      const data = loadJson(join(DATA_MAPS_DIR, file));
      expect(validate(data)).toBe(true);
    }
  });

  it('theme file validates against theme schema', () => {
    const validate = compileSchema('theme');
    const data = loadJson(join(DATA_THEMES_DIR, 'demons-heaven.json'));
    expect(validate(data)).toBe(true);
  });

  it('dragon-ball theme file validates against theme schema', () => {
    const validate = compileSchema('theme');
    const data = loadJson(join(DATA_THEMES_DIR, 'dragon-ball.json'));
    expect(validate(data)).toBe(true);
  });

  it('wave table validates against wave table schema', () => {
    const validate = compileSchema('wave_table');
    const data = loadJson(join(DATA_WAVES_DIR, 'wave_table.json'));
    expect(validate(data)).toBe(true);
  });

  it('difficulty config validates against difficulty schema', () => {
    const validate = compileSchema('difficulty');
    const data = loadJson('public/data/difficulty.json');
    expect(validate(data)).toBe(true);
  });
});

describe('Schema validation — malformed fixtures are rejected', () => {
  it('malformed tower (missing required fields, wrong tier count) fails validation', () => {
    const validate = compileSchema('tower');
    const data = loadJson(join(FIXTURES_DIR, 'malformed-tower.json'));
    expect(validate(data)).toBe(false);
  });

  it('theme with logic key in override fails validation (architecture invariant)', () => {
    const validate = compileSchema('theme');
    const data = loadJson(join(FIXTURES_DIR, 'theme-with-logic.json'));
    expect(validate(data)).toBe(false);
  });
});
