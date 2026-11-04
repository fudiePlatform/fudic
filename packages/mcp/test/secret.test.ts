/** The secret in the URL (criterion 2): kept between starts, renewed on demand. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { secretFile, secretOf } from '../src/secret.js';
import { tempDir } from './helpers.js';

let dir: ReturnType<typeof tempDir>;

beforeEach(() => {
  dir = tempDir();
});

afterEach(() => {
  dir.dispose();
});

describe('secretOf', () => {
  it('lives in .fudic/mcp/secret', () => {
    expect(secretFile(dir.root)).toBe(join(dir.root, '.fudic', 'mcp', 'secret'));
  });

  it('makes 32 random bytes in hex the first time, and writes them', () => {
    const secret = secretOf(dir.root);
    expect(secret).toMatch(/^[0-9a-f]{64}$/u);
    expect(readFileSync(secretFile(dir.root), 'utf8')).toBe(`${secret}\n`);
  });

  it('keeps it between starts', () => {
    const first = secretOf(dir.root);
    expect(secretOf(dir.root)).toBe(first);
  });

  it('a new one when asked: the old URL stops working', () => {
    const first = secretOf(dir.root);
    const renewed = secretOf(dir.root, true);
    expect(renewed).not.toBe(first);
    expect(secretOf(dir.root)).toBe(renewed);
  });

  it('a new one when the kept one is malformed', () => {
    mkdirSync(join(dir.root, '.fudic', 'mcp'), { recursive: true });
    writeFileSync(secretFile(dir.root), 'short\n');
    const secret = secretOf(dir.root);
    expect(secret).toMatch(/^[0-9a-f]{64}$/u);
    expect(existsSync(secretFile(dir.root))).toBe(true);
  });

  it('reads a kept one with spaces around it', () => {
    mkdirSync(join(dir.root, '.fudic', 'mcp'), { recursive: true });
    const kept = 'a'.repeat(64);
    writeFileSync(secretFile(dir.root), `  ${kept}\r\n`);
    expect(secretOf(dir.root)).toBe(kept);
  });
});
