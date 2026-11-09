/**
 * SDD-56 §4.15 in the plugin: which URLs are the functions', and the 404 of an app without a
 * `.fudapi`. The text of `functions.mjs` is `api-units`'s; the glue to Node, `@fudic/server/node`'s.
 */

import { describe, expect, it } from 'vitest';
import { isFnPath, noFunction } from '../src/functions.js';

describe('isFnPath', () => {
  it('under base + /_fudic/fn/ only', () => {
    expect(isFnPath('/_fudic/fn/routes/a/save', '/')).toBe(true);
    expect(isFnPath('/app/_fudic/fn/components/x/save', '/app/')).toBe(true);
    expect(isFnPath('/_fudic/fn/routes/a/save', '/app/')).toBe(false);
    expect(isFnPath('/_fudic/fnord', '/')).toBe(false);
    expect(isFnPath('/_fudic/data/a', '/')).toBe(false);
  });

  it('and under base + /_fudic/rule/: the question of a remote rule (SDD-80 §4.4)', () => {
    expect(isFnPath('/_fudic/rule/rules/people/alias-taken', '/')).toBe(true);
    expect(isFnPath('/app/_fudic/rule/rules/people/alias-taken', '/app/')).toBe(true);
    expect(isFnPath('/_fudic/rule/rules/people/alias-taken', '/app/')).toBe(false);
    expect(isFnPath('/_fudic/rules', '/')).toBe(false);
  });

  it('and the CSRF token, exactly at base + /_fudic/csrf (SDD-81 §3.13)', () => {
    expect(isFnPath('/_fudic/csrf', '/')).toBe(true);
    expect(isFnPath('/app/_fudic/csrf', '/app/')).toBe(true);
    expect(isFnPath('/_fudic/csrf', '/app/')).toBe(false);
    expect(isFnPath('/_fudic/csrf/x', '/')).toBe(false);
  });
});

describe('noFunction', () => {
  it('the 404 of a function URL in an app without a .fudapi', async () => {
    const response = noFunction();
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(await response.json()).toEqual({ status: 404, title: 'Not Found', detail: 'no such server function' });
  });
});
