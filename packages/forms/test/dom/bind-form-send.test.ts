/**
 * @vitest-environment happy-dom
 *
 * SDD-56 §3.5, §4.7 and criterion 26, the binding's part: `form:="@save"` hands `bindForm` the
 * server function. A valid submit is SENT, never navigated with; the result is announced on the
 * `<form>` as `fudic:result`, a 422 goes into the form like a client error, and anything else
 * is `fudic:error`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CATCHES, control, form, required } from '../../src/index.js';
import { bindForm, bindText } from '../../src/dom/index.js';
import type { AnyForm } from '../../src/types.js';
import { mount } from './_dom.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

function setup(
  send?: (f: AnyForm) => Promise<unknown>,
  links: Record<string, string> | null = null,
  catches?: readonly number[],
) {
  const host = mount(
    '<form>' +
      '<input id="a" type="text" aria-describedby="ea"><span id="ea"></span>' +
      '<input id="b" type="text" aria-describedby="eb"><span id="eb"></span>' +
      '</form><p id="sum" tabindex="-1" aria-live="polite"></p>',
  );
  const el = host.querySelector('form') as HTMLFormElement;
  const summary = host.querySelector('#sum') as HTMLElement;
  const schema = { a: control('', [required]), b: control('') };
  const f = catches === undefined ? form(schema) : form(schema, { catches });
  const offs = [
    bindText(host.querySelector('#a') as HTMLInputElement, f.a, host.querySelector('#ea') as HTMLElement),
    bindText(host.querySelector('#b') as HTMLInputElement, f.b, host.querySelector('#eb') as HTMLElement),
    bindForm(el, f as unknown as AnyForm, summary, links, send),
  ];
  const events: { type: string; detail: unknown }[] = [];
  for (const type of ['fudic:result', 'fudic:error']) {
    // On the document: the events bubble, so a listener above the form hears them too.
    document.addEventListener(type, (e) => events.push({ type, detail: (e as CustomEvent).detail }));
  }
  const submit = (): Event => {
    const event = new Event('submit', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event;
  };
  return { el, summary, f, offs, events, submit };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('bindForm with a server function', () => {
  it('a valid submit is prevented, sends the form, and emits fudic:result with the value', async () => {
    const send = vi.fn(async () => ({ id: 7 }));
    const { f, events, submit } = setup(send);
    f.a.set('Pedro');
    const event = submit();
    expect(event.defaultPrevented).toBe(true);
    expect(send).toHaveBeenCalledWith(f);
    await flush();
    expect(events).toEqual([{ type: 'fudic:result', detail: { id: 7 } }]);
  });

  it('an invalid submit is stopped as always, and nothing is sent', async () => {
    const send = vi.fn(async () => 1);
    const { events, submit } = setup(send);
    const event = submit();
    expect(event.defaultPrevented).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect((document.activeElement as HTMLElement).id).toBe('a');
    await flush();
    expect(events).toEqual([]);
  });

  it('a 422 paints the server errors on their fields and on the summary, and focuses as a client error', async () => {
    const rejection = { status: 422, errors: { b: { taken: true } }, summary: { mismatch: true } };
    const { f, events, submit, summary } = setup(async () => {
      throw rejection;
    });
    f.a.set('Pedro');
    submit();
    await flush();
    expect(f.b.errors()).toEqual({ taken: true });
    expect(f.$summary()).toEqual({ mismatch: true });
    expect(f.b.touched()).toBe(true);
    expect((document.activeElement as HTMLElement).id).toBe('b');
    expect(summary.textContent).not.toBe('');
    // A 422 is the form's: it emits nothing.
    expect(events).toEqual([]);
  });

  it('a 422 with a summary that links its fields focuses the summary', async () => {
    const { f, submit, summary } = setup(
      async () => {
        throw { status: 422, errors: { b: { taken: true } }, summary: null };
      },
      { b: 'b' },
    );
    f.a.set('Pedro');
    submit();
    await flush();
    expect(document.activeElement).toBe(summary);
  });

  it('any other error is fudic:error with the error as detail', async () => {
    const boom = { status: 500, title: 'Internal Server Error' };
    const { f, events, submit } = setup(async () => {
      throw boom;
    });
    f.a.set('Pedro');
    submit();
    await flush();
    expect(events).toEqual([{ type: 'fudic:error', detail: boom }]);
  });

  it('a 422 without errors stays in the form: its problem is the summary, under `server` (BUG-51)', async () => {
    const problem = { status: 422, title: 'Unprocessable Content', detail: 'revisa los datos' };
    const { f, events, submit, summary } = setup(async () => {
      throw { status: 422, problem };
    });
    f.a.set('Pedro');
    submit();
    await flush();
    expect(f.$summary()).toEqual({ server: problem });
    expect(summary.textContent).toContain('revisa los datos');
    expect(f.a.touched()).toBe(true);
    expect(events).toEqual([]);
  });

  it('a 409 with a detail stays in the form, and the summary says the detail (BUG-51)', async () => {
    const problem = { status: 409, title: 'Conflict', detail: 'ese email ya existe' };
    const { f, events, submit, summary } = setup(async () => {
      throw { status: 409, problem };
    });
    f.a.set('Pedro');
    submit();
    await flush();
    expect(f.$summary()).toEqual({ server: problem });
    expect(summary.textContent).toContain('ese email ya existe');
    expect(events).toEqual([]);
  });

  it('a kept status with no problem gets one made of its status (BUG-51)', async () => {
    const { f, events, submit, summary } = setup(async () => {
      throw { status: 400 };
    });
    f.a.set('Pedro');
    submit();
    await flush();
    expect(f.$summary()).toEqual({ server: { status: 400, title: '400' } });
    expect(summary.textContent).toContain('400');
    expect(events).toEqual([]);
  });

  it('a 422 with null errors is a summary of its problem too, not the errors of nothing', async () => {
    const problem = { status: 422, title: 'Unprocessable Content' };
    const { f, submit } = setup(async () => {
      throw { status: 422, errors: null, summary: null, problem };
    });
    f.a.set('Pedro');
    submit();
    await flush();
    expect(f.$summary()).toEqual({ server: problem });
  });

  it('a 422 with null errors but a summary keeps the server’s summary', async () => {
    const { f, events, submit } = setup(async () => {
      throw { status: 422, errors: null, summary: { mismatch: true }, problem: { status: 422, title: 'Unprocessable Content' } };
    });
    f.a.set('Pedro');
    submit();
    await flush();
    expect(f.$summary()).toEqual({ mismatch: true });
    expect(events).toEqual([]);
  });

  it('a 409 the form does not keep (`catches: [422]`) is fudic:error (BUG-51)', async () => {
    const refusal = { status: 409, problem: { status: 409, title: 'Conflict' } };
    const { f, events, submit } = setup(
      async () => {
        throw refusal;
      },
      null,
      [422],
    );
    f.a.set('Pedro');
    submit();
    await flush();
    expect(f.$summary()).toBeNull();
    expect(events).toEqual([{ type: 'fudic:error', detail: refusal }]);
  });

  it('a status the form adds (`catches: [...DEFAULT_CATCHES, 403]`) stays in it', async () => {
    const { f, events, submit } = setup(
      async () => {
        throw { status: 403, problem: { status: 403, title: 'Forbidden' } };
      },
      null,
      [...DEFAULT_CATCHES, 403],
    );
    f.a.set('Pedro');
    submit();
    await flush();
    expect(f.$summary()).toEqual({ server: { status: 403, title: 'Forbidden' } });
    expect(events).toEqual([]);
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['an Error', new Error('x')],
    ['a TypeError, which has no status', new TypeError('failed to fetch')],
    ['a status that is not a number', { status: '409' }],
  ])('%s is not a rejection of the form: fudic:error', async (_, error) => {
    const { f, events, submit } = setup(async () => {
      throw error;
    });
    f.a.set('Pedro');
    submit();
    await flush();
    expect(events).toEqual([{ type: 'fudic:error', detail: error }]);
  });

  it('without a server function, a valid submit is not prevented, as before', () => {
    const { f, submit } = setup();
    f.a.set('Pedro');
    expect(submit().defaultPrevented).toBe(false);
  });
});
