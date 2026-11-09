/**
 * `serve` in `fudic.json` (SDD-81 §3.5, §3.12, criterion 34): a trusted proxy and the limits of an
 * upload, every wrong shape a `FUD1488` that names the field.
 */

import { describe, expect, it } from 'vitest';
import type { FileDiagnostic } from '@fudic/diagnostics';
import { CONFIG_FILE, readProjectConfig, readServe, sizeOf, type ConfigIo } from '../src/index.js';

const ROOT = '/p';
const io = (text: string): ConfigIo => ({ exists: (path) => path === `${ROOT}/${CONFIG_FILE}`, read: () => text });

/** `fudic.json` with `serve` written as `serve`. */
const withServe = (serve: string) => readProjectConfig(ROOT, io(`{"id":"shop","serve":${serve}}`));

describe('sizeOf', () => {
  it('bytes as a whole number, or text with kb, mb or gb in base 1024, rounded down', () => {
    expect(sizeOf(1024)).toBe(1024);
    expect(sizeOf('500')).toBe(500);
    expect(sizeOf('500kb')).toBe(512000);
    expect(sizeOf('50mb')).toBe(52428800);
    expect(sizeOf(' 1.5GB ')).toBe(1610612736);
    expect(sizeOf('0.3kb')).toBe(307);
  });

  it('anything else is not a size', () => {
    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, 'x', '2mo', '3tb', 'mb', '', true, null, undefined, {}]) {
      expect(sizeOf(value)).toBeUndefined();
    }
  });
});

describe('serve in fudic.json', () => {
  it('absent: no serve in the config', () => {
    expect(readProjectConfig(ROOT, io('{"id":"shop"}')).config).not.toHaveProperty('serve');
  });

  it('trustProxy and uploads, sizes as bytes', () => {
    const { config, diagnostics } = withServe('{"trustProxy":true,"uploads":{"maxFileSize":"50mb","maxFiles":5,"maxArgs":2048}}');
    expect(diagnostics).toEqual([]);
    expect(config?.serve).toEqual({ trustProxy: true, uploads: { maxFileSize: 52428800, maxFiles: 5, maxArgs: 2048 } });
  });

  it('an empty serve and an empty uploads are kept as they are', () => {
    expect(withServe('{}').config?.serve).toEqual({});
    expect(withServe('{"uploads":{},"trustProxy":false}').config?.serve).toEqual({ trustProxy: false, uploads: {} });
  });

  it('criterion 34: every wrong shape is FUD1488 naming the field, with the span of its key', () => {
    const cases: readonly (readonly [string, string, string])[] = [
      ['1', 'serve', 'an object'],
      ['[]', 'serve', 'an object'],
      ['{"trustProxy":1}', 'serve.trustProxy', 'true or false'],
      ['{"uploads":{"maxFileSize":"x"}}', 'serve.uploads.maxFileSize', 'a size: bytes, or text such as "50mb"'],
      ['{"uploads":{"maxArgs":"2mo"}}', 'serve.uploads.maxArgs', 'a size'],
      ['{"uploads":{"maxFiles":1.5}}', 'serve.uploads.maxFiles', 'a whole number'],
      ['{"uploads":{"maxFiles":"3"}}', 'serve.uploads.maxFiles', 'a whole number'],
      ['{"uploads":{"maxFiles":-1}}', 'serve.uploads.maxFiles', 'a whole number'],
      ['{"uploads":null}', 'serve.uploads', 'an object'],
      ['{"uploads":{"maxSize":1}}', 'serve.uploads.maxSize', 'a known key: maxFileSize, maxFiles or maxArgs'],
      ['{"trustproxy":true}', 'serve.trustproxy', 'a known key: trustProxy or uploads'],
    ];
    for (const [serve, field, expected] of cases) {
      const text = `{"id":"shop","serve":${serve}}`;
      const { config, diagnostics } = readProjectConfig(ROOT, io(text));
      expect(config, serve).toBeNull();
      expect(diagnostics, serve).toHaveLength(1);
      const [d] = diagnostics as FileDiagnostic[];
      expect(d!.code).toBe('FUD1488');
      expect(d!.file).toBe(CONFIG_FILE);
      expect(d!.message).toContain(`\`${field}\` has to be ${expected}`);
      const key = `"${field.slice(field.lastIndexOf('.') + 1)}"`;
      expect(d!.span, serve).toEqual({ start: text.indexOf(key), end: text.indexOf(key) + key.length });
    }
  });

  it('every wrong field is told, not only the first', () => {
    const { diagnostics } = withServe('{"trustProxy":"yes","uploads":{"maxFiles":"x","maxArgs":"y"}}');
    expect(diagnostics.map((d) => (d as FileDiagnostic).message)).toEqual([
      expect.stringContaining('serve.trustProxy'),
      expect.stringContaining('serve.uploads.maxFiles'),
      expect.stringContaining('serve.uploads.maxArgs'),
    ]);
  });

  it('readServe with a span nobody can find: the diagnostic has no span', () => {
    const diagnostics: FileDiagnostic[] = [];
    expect(readServe({ serve: { trustProxy: 'no' } }, diagnostics, () => undefined)).toEqual({});
    expect(diagnostics[0]).not.toHaveProperty('span');
    expect(readServe({}, diagnostics, () => undefined)).toEqual({});
  });
});
