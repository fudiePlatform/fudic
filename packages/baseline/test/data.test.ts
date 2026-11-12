import { describe, expect, it } from 'vitest';
import { CSS_UNITS, TAG_INTERFACES } from '../src/data.generated.js';
import { status } from '../src/index.js';

describe('the generated table (SDD-83 §4.2)', () => {
  it('names only keys the data has for every CSS unit', () => {
    for (const key of Object.values(CSS_UNITS)) expect(status(key), key).toBeDefined();
  });

  it('names only interfaces the data has for every tag', () => {
    for (const name of Object.values(TAG_INTERFACES)) expect(status(`api.${name}`), name).toBeDefined();
  });

  it('leaves out http.*: a browser ignores a header it does not know', () => {
    expect(status('http.headers.Content-Security-Policy')).toBeUndefined();
  });
});
