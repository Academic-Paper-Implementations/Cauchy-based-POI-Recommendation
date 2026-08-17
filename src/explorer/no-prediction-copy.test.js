import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Tripwire, not a linter: the Explorer is framed as discovery ("what is around
// here"), never next-POI prediction — the committee dropped POI top-k. If a
// prediction phrase creeps into any explorer surface, this fails the build.
const HERE = dirname(fileURLToPath(import.meta.url));
const BANNED = [/next stop/i, /predict/i, /\byour next\b/i, /forecast/i, /sẽ đến tiếp/i];

const sources = readdirSync(HERE).filter(
  (name) => (name.endsWith('.jsx') || name.endsWith('.js')) && !name.includes('.test.')
);

describe('explorer copy stays discovery, not prediction', () => {
  it.each(sources)('%s uses no prediction wording', (name) => {
    const text = readFileSync(join(HERE, name), 'utf8');
    for (const pattern of BANNED) {
      expect(text, `${name} must not contain ${pattern}`).not.toMatch(pattern);
    }
  });
});
