/**
 * compileComponentSsr — the public one-call entry: `.fud` source → SSR emit artifacts.
 * Runs the real pipeline; here we check the top-level dispatch (component vs not).
 */
import { describe, expect, it } from 'vitest';
import { compileComponentSsr } from '../../src/emit/index.js';
import { fixture } from './_support.js';

describe('compileComponentSsr', () => {
  it('compiles a component to its render function and style module', () => {
    const result = compileComponentSsr(fixture('app-badge.fud'));
    expect(result.specifier).toBe('app-badge');
    expect(result.render).toContain('function render($dom, $shadow, props)');
    expect(result.styleModule).toContain('<style type="module" specifier="app-badge">');
    expect(result.diagnostics).not.toContain('not a component document (page emit is a later slice).');
  });

  it('rejects a non-component document with a diagnostic and empty artifacts', () => {
    const result = compileComponentSsr(fixture('home.fud'));
    expect(result.specifier).toBe('');
    expect(result.render).toBe('');
    expect(result.styleModule).toBe('');
    expect(result.diagnostics).toContain('not a component document (page emit is a later slice).');
  });
});
