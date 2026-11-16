import { describe, expect, it } from 'vitest';
import { browsersFor } from '../src/index.js';

describe('browsersFor: a level as the build.target of Vite (SDD-83 §3.9)', () => {
  it('names the last release of each core browser on the cutoff or before', () => {
    const widely = ['chrome124', 'edge124', 'firefox125', 'safari17.4', 'ios17.4'];
    expect(browsersFor('widely', '2026-10-27')).toEqual(widely);
    expect(browsersFor('widely')).toEqual(widely);
  });

  it('names a year by its last day', () => {
    expect(browsersFor(2024)).toEqual(['chrome131', 'edge131', 'firefox133', 'safari18.2', 'ios18.2']);
  });

  it('leaves out a browser that did not exist yet', () => {
    expect(browsersFor(2012)).toEqual(['chrome23', 'firefox17', 'safari6', 'ios6']);
  });
});
