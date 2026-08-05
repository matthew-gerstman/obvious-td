import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import Ajv from 'ajv';

const SCHEMAS_DIR = 'schemas';
const DATA_DIR = 'data/samples';

/**
 * Validates JSON fixture files against their corresponding schemas.
 * Convention: a file named `<name>.schema.json` in schemas/ validates
 * `valid-<name>.json` (must pass) and `invalid-<name>.json` (must fail)
 * in data/samples/.
 *
 * Exits non-zero if any validation check fails.
 */
function main(): void {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const schemaFiles = readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith('.schema.json'));

  let failures = 0;

  for (const schemaFile of schemaFiles) {
    const baseName = schemaFile.replace('.schema.json', '');
    const schemaPath = join(SCHEMAS_DIR, schemaFile);
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as object;
    const validate = ajv.compile(schema);

    const validFixture = join(DATA_DIR, `valid-${baseName}.json`);
    const invalidFixture = join(DATA_DIR, `invalid-${baseName}.json`);

    // Valid fixture must pass
    try {
      const data = JSON.parse(readFileSync(validFixture, 'utf-8'));
      if (!validate(data)) {
        console.error(`FAIL: ${basename(validFixture)} should be valid but failed: ${ajv.errorsText(validate.errors)}`);
        failures++;
      } else {
        console.log(`PASS: ${basename(validFixture)} is valid`);
      }
    } catch (err) {
      console.error(`ERROR: could not read ${validFixture}: ${err}`);
      failures++;
    }

    // Invalid fixture must fail
    try {
      const data = JSON.parse(readFileSync(invalidFixture, 'utf-8'));
      if (validate(data)) {
        console.error(`FAIL: ${basename(invalidFixture)} should be invalid but passed validation`);
        failures++;
      } else {
        console.log(`PASS: ${basename(invalidFixture)} correctly rejected`);
      }
    } catch (err) {
      console.error(`ERROR: could not read ${invalidFixture}: ${err}`);
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} validation failure(s)`);
    process.exit(1);
  }

  console.log('\nAll schema validations passed.');
}

main();

