import { describe, it, expect } from 'vitest';
import { ModeStack } from '../../src/types/mode.js';

describe('ModeStack', () => {
  it('defaults to the html background mode at depth 1', () => {
    const stack = new ModeStack();
    expect(stack.current).toBe('html');
    expect(stack.depth).toBe(1);
  });

  it('accepts a custom background mode', () => {
    expect(new ModeStack('css').current).toBe('css');
  });

  it('push raises the top and depth', () => {
    const stack = new ModeStack();
    stack.push('js');
    expect(stack.current).toBe('js');
    expect(stack.depth).toBe(2);
  });

  it('pop returns the top with no diagnostics and lowers the stack', () => {
    const stack = new ModeStack();
    stack.push('js');
    const result = stack.pop(10);
    expect(result.value).toBe('js');
    expect(result.diagnostics).toEqual([]);
    expect(stack.current).toBe('html');
    expect(stack.depth).toBe(1);
  });

  it('pop on the background mode does not pop and emits FUD0001 located at the offset', () => {
    const stack = new ModeStack();
    const result = stack.pop(7);
    expect(stack.depth).toBe(1);
    expect(result.value).toBe('html');
    expect(result.diagnostics).toHaveLength(1);
    const [diag] = result.diagnostics;
    expect(diag?.severity).toBe('error');
    expect(diag?.code).toBe('FUD0001');
    expect(diag?.span).toEqual({ start: 7, end: 7 });
  });

  it('clone produces an independent stack', () => {
    const original = new ModeStack();
    original.push('js');
    const copy = original.clone();
    copy.push('css');
    expect(copy.depth).toBe(3);
    expect(original.depth).toBe(2);
    expect(original.current).toBe('js');
  });
});
