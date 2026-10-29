import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { task } from '@fudic/core';
import { ValidationError } from '@fudic/http';
import { respondProblem, visit } from '@fudic/testing';
import { crash, login, search } from 'fudic:routes/usuarios';

// SDD-68 §6, criteria 11, 15–17 and 19, on the page itself: its `load`, its functions and their
// chain (`auth`, `error-pages`) run on the in-memory server, and the refresh after a call asks
// that same server for `/_fudic/data/usuarios`.

// The people table, mocked so every test starts from the same three rows: the real one is
// module state, and a `remove` in one test would be missing from the next.
const people = vi.hoisted(() => {
  type Person = { id: number; name: string; email: string; age: number; active: boolean; notes: string };
  const table: Person[] = [];
  return {
    table,
    reset(): void {
      table.splice(
        0,
        table.length,
        { id: 1, name: 'Ana', email: 'ana@fudic.dev', age: 34, active: true, notes: '' },
        { id: 2, name: 'Luis', email: 'luis@fudic.dev', age: 41, active: false, notes: '' },
        { id: 3, name: 'Marta', email: 'marta@fudic.dev', age: 29, active: true, notes: '' },
      );
    },
  };
});
vi.mock('../data/people', () => ({
  allPeople: () => people.table,
  addPerson: () => {
    throw new Error('not in these tests');
  },
  setActive: (id: number, active: boolean) => {
    const at = people.table.findIndex((p) => p.id === id);
    if (at === -1) return false;
    people.table[at] = { ...people.table[at]!, active };
    return true;
  },
  removePerson: (id: number) => {
    const at = people.table.findIndex((p) => p.id === id);
    if (at === -1) return false;
    people.table.splice(at, 1);
    return true;
  },
  emailTaken: async () => false,
}));

/** Every request the page makes, by method and path, in order. */
let requests: string[];
let reload: ReturnType<typeof vi.spyOn>;
let assign: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  people.reset();
  requests = [];
});
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Visit the page, sign in as Ana by the cookie `login` sets (the harness empties the jar between
 * tests), and start recording what it asks, and whether it reloads or navigates.
 */
async function usuarios(options: Parameters<typeof visit>[1] = {}) {
  const page = await visit('/usuarios', options);
  if (options.fetch === undefined) await login({ user: 'ana' });
  const original = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const request = input instanceof Request ? input : new Request(new URL(String(input), location.href), init);
    requests.push(`${request.method} ${new URL(request.url).pathname}`);
    return original(request);
  });
  reload = vi.spyOn(location, 'reload').mockImplementation(() => undefined);
  assign = vi.spyOn(location, 'assign').mockImplementation(() => undefined);
  return page;
}

const rows = (): HTMLTableRowElement[] => [...document.querySelectorAll('tbody tr')] as HTMLTableRowElement[];
const rowOf = (name: string): HTMLTableRowElement => rows().find((r) => r.cells[0]!.textContent === name)!;
const activeOf = (name: string): HTMLInputElement => rowOf(name).querySelector('input[type="checkbox"]')!;

describe('criterion 15: unticking «Activo» repaints the row without reloading', () => {
  test('saves, asks for the data once, and the row shows the new state', async () => {
    const page = await usuarios();
    const before = rows();
    const box = activeOf('Ana');
    expect(box.checked).toBe(true);
    // Focused as a click in a browser leaves it: the repaint must not take the focus away.
    box.focus();
    // And nothing in the table is taken out and put back: that is what would drop the focus.
    const churn: MutationRecord[] = [];
    const observer = new MutationObserver((records) => void churn.push(...records));
    observer.observe(document.querySelector('tbody')!, { childList: true });

    await page.click(box);
    observer.disconnect();
    expect(churn).toEqual([]);

    expect(people.table.find((p) => p.id === 1)!.active).toBe(false);
    expect(requests.filter((r) => r.startsWith('PUT '))).toHaveLength(1);
    expect(requests.filter((r) => r === 'GET /_fudic/data/usuarios')).toHaveLength(1);
    // The refresh comes after the save it follows.
    expect(requests.findIndex((r) => r.startsWith('PUT '))).toBeLessThan(requests.indexOf('GET /_fudic/data/usuarios'));
    expect(reload).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    // The same rows, the same box, still focused: nothing was rebuilt, nothing reloaded.
    expect(rows()).toEqual(before);
    expect(activeOf('Ana')).toBe(box);
    expect(box.checked).toBe(false);
    expect(document.activeElement).toBe(box);
  });

  test('what the server says wins: a row turned on elsewhere shows on in the repaint', async () => {
    const page = await usuarios();
    // Another tab turns Marta off; this one ticks Luis on.
    people.table[2] = { ...people.table[2]!, active: false };
    await page.click(activeOf('Luis'));
    expect(activeOf('Luis').checked).toBe(true);
    expect(activeOf('Marta').hasAttribute('checked')).toBe(false);
  });
});

describe('criterion 16: «Borrar» takes the row out, and the others stay the same nodes', () => {
  test('removes Luis; Ana and Marta are the nodes they were', async () => {
    const page = await usuarios();
    const ana = rowOf('Ana');
    const marta = rowOf('Marta');
    await page.click(rowOf('Luis').querySelector('button')!);
    expect(people.table.map((p) => p.name)).toEqual(['Ana', 'Marta']);
    expect(requests.filter((r) => r === 'GET /_fudic/data/usuarios')).toHaveLength(1);
    expect(rows()).toEqual([ana, marta]);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('criterion 17: a data endpoint that fails reloads the document', () => {
  test('the save goes through, the refresh answers 500, and the page reloads', async () => {
    const page = await usuarios();
    const original = vi.mocked(globalThis.fetch).getMockImplementation()!;
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => {
      const request = input instanceof Request ? input : new Request(new URL(String(input), location.href), init);
      if (new URL(request.url).pathname.startsWith('/_fudic/data/')) {
        requests.push(`${request.method} ${new URL(request.url).pathname}`);
        return Promise.resolve(new Response('{"status":500,"title":"boom"}', { status: 500 }));
      }
      return original(request);
    });
    await page.click(activeOf('Ana'));
    expect(people.table.find((p) => p.id === 1)!.active).toBe(false);
    expect(requests).toContain('GET /_fudic/data/usuarios');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('criterion 11: error-pages decides before the task', () => {
  test('a 500 navigates to _error.fud, and the task never fails', async () => {
    await usuarios();
    const t = task(crash);
    void t.run();
    await vi.waitFor(() => expect(assign).toHaveBeenCalled());
    expect(assign.mock.calls[0]![0]).toMatch(/\/500(\?|$)/u);
    expect(t.state()).toBe('pending');
    expect(t.error()).toBeUndefined();
  });

  test('a 422 nobody keeps reaches the task as a ValidationError', async () => {
    const problem = { status: 422, title: 'Unprocessable', errors: { q: ['demasiado largo'] } };
    await usuarios({ fetch: () => respondProblem(search, problem) });
    const t = task(search);
    expect(await t.run({ q: 'ana' })).toBeUndefined();
    expect(t.state()).toBe('failed');
    expect(t.error()).toBeInstanceOf(ValidationError);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('criterion 19: what the page shows', () => {
  /** What a hanging server still holds: let go after each test, so the next one does not wait for it. */
  const holding: (() => void)[] = [];
  afterEach(() => {
    for (const release of holding.splice(0)) release();
  });

  /** A server that never answers, but lets go of a request when it is aborted. */
  function hanging(): { fetch: (request: Request) => Promise<Response>; seen: Request[] } {
    const seen: Request[] = [];
    return {
      seen,
      fetch: (request) => {
        seen.push(request);
        return new Promise<Response>((_resolve, reject) => {
          const abort = (): void => reject(new DOMException('aborted', 'AbortError'));
          request.signal.addEventListener('abort', abort);
          holding.push(abort);
        });
      },
    };
  }

  const status = (heading: string): string => {
    const h2 = [...document.querySelectorAll('h2')].find((h) => h.textContent === heading)!;
    return (h2.nextElementSibling!.querySelector('[role="status"]')!.textContent ?? '').trim();
  };

  test('typing searches, shows «Buscando…» meanwhile, and a new key aborts the old search', async () => {
    const server = hanging();
    await usuarios({ fetch: server.fetch });
    const input = document.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'a';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(status('Buscar')).toBe('Buscando…'));
    input.value = 'an';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(server.seen).toHaveLength(2));
    expect(server.seen[0]!.signal.aborted).toBe(true);
    expect(server.seen[1]!.signal.aborted).toBe(false);
    expect(status('Buscar')).toBe('Buscando…');
  });

  test('the slow search shows «Buscando…», and «Cancelar» aborts it and says so', async () => {
    const server = hanging();
    await usuarios({ fetch: server.fetch });
    const [lenta, cancelar] = [...document.querySelectorAll('button')].filter((b) =>
      ['Búsqueda lenta (3 s)', 'Cancelar'].includes(b.textContent ?? ''),
    );
    lenta!.click();
    await vi.waitFor(() => expect(status('Búsqueda lenta')).toBe('Buscando…'));
    cancelar!.click();
    await vi.waitFor(() => expect(status('Búsqueda lenta')).toBe('Búsqueda cancelada.'));
    expect(server.seen).toHaveLength(1);
    expect(server.seen[0]!.signal.aborted).toBe(true);
  });

  test('a search that answers paints its people', async () => {
    const page = await usuarios();
    await page.type(page.getByRole('searchbox', { name: 'Buscar por nombre' }), 'mar');
    await vi.waitFor(() => expect(status('Buscar')).toBe(''));
    const h2 = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Buscar')!;
    expect([...h2.nextElementSibling!.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Marta — marta@fudic.dev',
    ]);
  });
});
