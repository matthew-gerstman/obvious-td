import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';

const SCHEMAS_DIR = 'schemas';
const DATA_ARCHETYPES_DIR = 'public/data/archetypes';
const DATA_MAPS_DIR = 'public/data/maps';
const DATA_THEMES_DIR = 'public/data/themes';
const DATA_WAVES_DIR = 'public/data/waves';

/**
 * Validates all game data files against their corresponding JSON schemas.
 * Covers towers, enemies, maps, themes, wave tables, and difficulty config.
 * Exits non-zero if any validation check fails.
 */
function main(): void {
  const ajv = new Ajv({ allErrors: true, strict: true });
  let failures = 0;

  const compile = (name: string) =>
    ajv.compile(JSON.parse(readFileSync(join(SCHEMAS_DIR, `${name}.schema.json`), 'utf-8')) as object);

  const towerValidate = compile('tower');
  const enemyValidate = compile('enemy');
  const mapValidate = compile('map');
  const themeValidate = compile('theme');
  const waveTableValidate = compile('wave_table');
  const difficultyValidate = compile('difficulty');

  const check = (filePath: string, validate: ReturnType<typeof compile>, label: string): void => {
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));
      if (!validate(data)) {
        console.error(`FAIL: ${label} — ${ajv.errorsText(validate.errors)}`);
        failures++;
      } else {
        console.log(`PASS: ${label}`);
      }
    } catch (err) {
      console.error(`ERROR: ${filePath}: ${err}`);
      failures++;
    }
  };

  // Tower files
  const towerFiles = readdirSync(DATA_ARCHETYPES_DIR)
    .filter(file => file.startsWith('tower_') && file.endsWith('.json'));
  for (const file of towerFiles) {
    check(join(DATA_ARCHETYPES_DIR, file), towerValidate, `tower: ${file}`);
  }

  // Enemy files
  const enemyFiles = readdirSync(DATA_ARCHETYPES_DIR)
    .filter(file => file.startsWith('enemy_') && file.endsWith('.json'));
  for (const file of enemyFiles) {
    check(join(DATA_ARCHETYPES_DIR, file), enemyValidate, `enemy: ${file}`);
  }

  // Map files
  const mapFiles = readdirSync(DATA_MAPS_DIR)
    .filter(file => file.startsWith('map_') && file.endsWith('.json'));
  for (const file of mapFiles) {
    check(join(DATA_MAPS_DIR, file), mapValidate, `map: ${file}`);
  }

  // Theme
  check(join(DATA_THEMES_DIR, 'demons-heaven.json'), themeValidate, 'theme: demons-heaven.json');

  // Wave table
  check(join(DATA_WAVES_DIR, 'wave_table.json'), waveTableValidate, 'wave table: wave_table.json');

  // Difficulty
  check('public/data/difficulty.json', difficultyValidate, 'difficulty: difficulty.json');

  if (failures > 0) {
    console.error(`\n${failures} validation failure(s)`);
    process.exit(1);
  }

  console.log('\nAll schema validations passed.');
}

main();
