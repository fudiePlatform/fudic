/** SDD-20 §4.7 / §6.19: `sw.json` — no file, no Service Worker; and TTL parsing. */

import { describe, it, expect } from 'vitest';
import { parseTtl, readSwConfig, type ConfigIo } from '../src/swconfig.js';
import { FUD_SW_CONFIG_MALFORMED, FUD_TTL_INVALID } from '../src/diagnostics.js';

const io = (files: Record<string, string>): ConfigIo => ({
  exists: (p) => p in files,
  read: (p) => files[p]!,
});

describe('parseTtl', () => {
  it('parses the four units', () => {
    expect(parseTtl('30s')).toBe(30_000);
    expect(parseTtl('5m')).toBe(300_000);
    expect(parseTtl('2h')).toBe(7_200_000);
    expect(parseTtl('7d')).toBe(604_800_000);
  });

  it('null and absent mean no expiry; anything else is invalid', () => {
    expect(parseTtl(null)).toBeNull();
    expect(parseTtl(undefined)).toBeNull();
    expect(parseTtl('forever')).toBeUndefined();
    expect(parseTtl('5')).toBeUndefined();
  });
});

describe('readSwConfig', () => {
  it('no sw.json → no Service Worker, and no complaint about it', () => {
    expect(readSwConfig('/app', io({}))).toEqual({ config: null, diagnostics: [] });
  });

  it('reads the shell and compiles the resource rules in order', () => {
    const result = readSwConfig(
      '/app',
      io({
        '/app/sw.json': JSON.stringify({
          shell: ['/style.css', '/main.js'],
          resources: {
            assets: { pattern: '/assets/**', policy: 'cache-first', ttl: null, maxEntries: 200 },
            api: { pattern: '/api/**', policy: 'network-first', ttl: '5m' },
          },
          dev: 'preview',
        }),
      }),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.config).toEqual({
      shell: ['/style.css', '/main.js'],
      resources: [
        { pattern: '/assets/**', policy: 'cache-first', ttl: null, maxEntries: 200 },
        { pattern: '/api/**', policy: 'network-first', ttl: 300_000 },
      ],
      dev: 'preview',
    });
  });

  it('defaults dev to off', () => {
    const { config } = readSwConfig('/app', io({ '/app/sw.json': '{"shell":[]}' }));
    expect(config?.dev).toBe('off');
  });

  it('invalid JSON and a missing shell are FUD0390, with no Service Worker', () => {
    expect(readSwConfig('/app', io({ '/app/sw.json': '{oops' })).config).toBeNull();
    expect(readSwConfig('/app', io({ '/app/sw.json': '{oops' })).diagnostics[0]?.code).toBe(
      FUD_SW_CONFIG_MALFORMED,
    );
    expect(readSwConfig('/app', io({ '/app/sw.json': '{"resources":{}}' })).config).toBeNull();
    expect(readSwConfig('/app', io({ '/app/sw.json': 'null' })).config).toBeNull();
  });

  it('skips a rule with an invalid policy or ttl, keeping the rest', () => {
    const { config, diagnostics } = readSwConfig(
      '/app',
      io({
        '/app/sw.json': JSON.stringify({
          shell: [],
          resources: {
            bad: { pattern: '/x/**', policy: 'whenever' },
            worse: { pattern: '/y/**', policy: 'cache-first', ttl: '5 minutes' },
            good: { pattern: '/z/**', policy: 'network-only' },
          },
        }),
      }),
    );
    expect(config?.resources).toEqual([{ pattern: '/z/**', policy: 'network-only', ttl: null }]);
    expect(diagnostics.map((d) => d.code)).toEqual([FUD_SW_CONFIG_MALFORMED, FUD_TTL_INVALID]);
  });
});
