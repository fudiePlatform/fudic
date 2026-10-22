import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mount } from '../../src/index.js';
import { handled } from './src/data/greetings';
import { sides } from './src/data/sides';
import * as XAlias from './src/components/x-alias.fud';
import * as XHello from './src/components/x-hello.fud';

// The data edge, mocked: the server validator reads it, and the mock reaches it (§4.1).
vi.mock('./src/data/aliases', () => ({ aliasTaken: async (alias: string) => alias === 'admin' }));

beforeEach(() => {
  handled.count = 0;
  sides.length = 0;
});

describe('criterion 12: the in-memory server', () => {
  test('a component calls its server function and receives what handle returned', async () => {
    const t = await mount(XHello);
    await t.click(t.getByRole('button'));
    expect(t.getByRole('status')).toHaveTextContent('Hello, Ana');
    expect(handled.count).toBe(1);
  });
});

describe('criterion 13: the chain, side by side', () => {
  test('each half on its side, once; one written for both sides runs on both', async () => {
    const t = await mount(XHello);
    await t.click(t.getByRole('button'));
    expect(sides.filter((s) => s === 'halves:client')).toHaveLength(1);
    expect(sides.filter((s) => s === 'halves:server')).toHaveLength(1);
    expect(sides.filter((s) => s.startsWith('plain:')).sort()).toEqual(['plain:client', 'plain:server']);
    expect(sides.indexOf('halves:client')).toBeLessThan(sides.indexOf('halves:server'));
  });
});

describe('criterion 14: csrf in the global chain', () => {
  test('the call passes: the client half put its header, the browser its same-origin', async () => {
    const t = await mount(XHello);
    await t.click(t.getByRole('button'));
    expect(t.getByRole('alert')).toHaveTextContent('');
    expect(t.getByRole('status')).toHaveTextContent('Hello, Ana');
  });
});

describe('criterion 15: a server validator over mocked data', () => {
  test('the server answers 422 and the error reaches its slot', async () => {
    const t = await mount(XAlias);
    await t.type(t.getByLabelText('Alias'), 'admin');
    await t.submit();
    expect(t.errorOf('Alias')).toBe('That alias is taken.');
    expect(t.getByRole('status')).toHaveTextContent('');
  });

  test('a free alias is saved', async () => {
    const t = await mount(XAlias);
    await t.type(t.getByLabelText('Alias'), 'pedro');
    await t.submit();
    expect(t.errorOf('Alias')).toBeNull();
    expect(t.getByRole('status')).toHaveTextContent('saved');
  });
});

describe('criterion 16: fetch in the options', () => {
  test('a TypeError reaches the view as a network failure does in a browser', async () => {
    const t = await mount(XHello, {
      fetch: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await t.click(t.getByRole('button'));
    expect(t.getByRole('alert')).toHaveTextContent('TypeError');
    expect(handled.count).toBe(0);
  });

  test('a 500 reaches the view with its status', async () => {
    const t = await mount(XHello, { fetch: () => new Response(null, { status: 500 }) });
    await t.click(t.getByRole('button'));
    expect(t.getByRole('alert')).toHaveTextContent('500');
  });
});

describe('criterion 17: no network', () => {
  test('a request anywhere else throws naming the URL', async () => {
    await expect(fetch('https://api.example.com/users')).rejects.toThrow(
      'fetch(https://api.example.com/users): a test has no network',
    );
    await expect(fetch(new Request('http://localhost/elsewhere'))).rejects.toThrow('fetch(http://localhost/elsewhere)');
  });
});

describe('criterion 27: one test does not see the fetch of the one before', () => {
  test('the first answers with its own fetch', async () => {
    await mount(XHello, { fetch: () => new Response('"mine"') });
    await expect((await fetch('/_fudic/fn/components/x-hello/greet', { method: 'POST' })).text()).resolves.toBe('"mine"');
  });

  test('the second is served by the in-memory server again', async () => {
    const response = await fetch('/_fudic/fn/components/x-hello/nope', { method: 'POST' });
    expect(response.status).toBe(404);
  });
});
