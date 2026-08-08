import { describe, expect, it } from 'vitest';

import * as conventions from '../src/index.js';

describe('@fudic/conventions', () => {
  it('names the four project directories', () => {
    expect(conventions.SRC_DIR).toBe('src');
    expect(conventions.ROUTES_DIR).toBe('routes');
    expect(conventions.COMPONENTS_DIR).toBe('components');
    expect(conventions.LAYOUTS_DIR).toBe('layouts');
  });

  it('exports those four names and nothing else', () => {
    // The door stays shut (BUG-20 §3.4). A fifth export is not a smaller change than a
    // fifth package: it is how a convention package turns into a drawer of shared strings,
    // so growing the surface has to be a deliberate edit to this list.
    expect(Object.keys(conventions).sort()).toEqual(['COMPONENTS_DIR', 'LAYOUTS_DIR', 'ROUTES_DIR', 'SRC_DIR']);
  });
});
