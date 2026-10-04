import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect } from 'vitest';

// Golden-file helper for characterization tests: compare a JSON-serializable value with a fixture
// recorded from the code as it behaved when the fixture was made. Re-record (only when a behavior
// change is intended) with:  GOLDEN_UPDATE=1 npx vitest run tests/characterization

const FIXTURES = join(__dirname, '..', 'fixtures', 'golden');

export function expectGolden(name, value) {
  const file = join(FIXTURES, name);
  // normalise through JSON so undefined/NaN etc. serialize the way the fixture stores them
  const actual = JSON.parse(
    JSON.stringify(value, (k, v) => (v === undefined ? '__undefined__' : v))
  );
  if (process.env.GOLDEN_UPDATE) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(actual, null, 1) + '\n');
    return;
  }
  expect(existsSync(file), `missing golden fixture ${name} (record it with GOLDEN_UPDATE=1)`).toBe(
    true
  );
  expect(actual).toEqual(JSON.parse(readFileSync(file, 'utf8')));
}
