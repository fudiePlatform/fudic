import { beforeEach, describe, expect, it, vi } from 'vitest';
import { delegate } from '../src/index.js';

describe('delegate (SDD-14 §6.9)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('calls the handler once with the marked element on a descendant click', () => {
    document.body.innerHTML = '<div data-fud-e="app-a:click"><button>go</button></div>';
    const fn = vi.fn();
    delegate.on('app-a:click', fn);
    delegate.connect(document, 'click');
    document.querySelector('button')?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]?.[1]).toBe(document.querySelector('[data-fud-e]'));
  });

  it('a second connect does not duplicate the listener', () => {
    document.body.innerHTML = '<span data-fud-e="app-b:click">x</span>';
    const fn = vi.fn();
    delegate.on('app-b:click', fn);
    delegate.connect(document, 'click');
    delegate.connect(document, 'click');
    document.querySelector('span')?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('matches when the target itself carries the marker, on a second type', () => {
    document.body.innerHTML = '<span data-fud-e="app-c:keydown">x</span>';
    const fn = vi.fn();
    delegate.on('app-c:keydown', fn);
    delegate.connect(document, 'keydown');
    document.querySelector('span')?.dispatchEvent(new Event('keydown', { bubbles: true }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('one listener per (root, type): a shadow root connects independently', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<i data-fud-e="app-d:click">x</i>';
    const fn = vi.fn();
    delegate.on('app-d:click', fn);
    delegate.connect(root, 'click');
    root.querySelector('i')?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ignores events outside any [data-fud-e]', () => {
    document.body.innerHTML = '<p>plain</p>';
    const fn = vi.fn();
    delegate.on('app-e:click', fn);
    delegate.connect(document, 'click');
    document.querySelector('p')?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(fn).not.toHaveBeenCalled();
  });

  it('ignores markers without a registered handler', () => {
    document.body.innerHTML = '<b data-fud-e="app-unregistered:click">x</b>';
    const fn = vi.fn();
    delegate.on('app-f:click', fn);
    delegate.connect(document, 'click');
    document.querySelector('b')?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(fn).not.toHaveBeenCalled();
  });

  it('ignores events whose target is not an element', () => {
    const fn = vi.fn();
    delegate.on('app-g:click', fn);
    delegate.connect(document, 'click');
    document.dispatchEvent(new Event('click'));
    expect(fn).not.toHaveBeenCalled();
  });
});
