/// <reference types="vite/client" />
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { mount, type FudModule } from '@fudic/testing';

// SDD-85 criterion 8, over the example: every component, created in the browser from its
// template, is the tree the server paints for it — node for node, nested components included.
// Mounted both ways with the same props: `ssr` paints and hydrates, `client` creates.
//
// The clock stands still: `app-clock` paints the time, and the two mounts are a moment apart.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-16T10:00:00Z') });
});

const modules = import.meta.glob<FudModule>('./components/*.fud', { eager: true });

/** The tree of a shadow root and of every shadow root below it, as one string. */
function tree(root: ParentNode): string {
  const lines: string[] = [];
  walk(root, 0, lines);
  return lines.join('\n');
}

function walk(parent: ParentNode, depth: number, out: string[]): void {
  const pad = '  '.repeat(depth);
  let text: string | null = null;
  const flush = (): void => {
    // Where one text node ends and the next begins is not something HTML keeps.
    if (text !== null && text !== '') out.push(`${pad}${JSON.stringify(text)}`);
    text = null;
  };
  const children = parent instanceof HTMLTemplateElement ? parent.content.childNodes : parent.childNodes;
  for (const node of children) {
    if (node.nodeType === Node.TEXT_NODE) {
      text = (text ?? '') + (node as Text).data;
      continue;
    }
    flush();
    if (node.nodeType === Node.COMMENT_NODE) {
      out.push(`${pad}<!--${(node as Comment).data}-->`);
      continue;
    }
    const el = node as Element;
    // The order of the attributes is not compared (SDD-85 §8.2, decision 22), nor `data-fud-id`,
    // which only an instance the page painted carries, nor an emptied `class=""` (§4.5, rule 3).
    // And the `tabindex` the runtime gives a host whose shadow root should delegate focus and does
    // not (SDD-83 §4.6): happy-dom's declarative shadow roots never do, its `attachShadow` does.
    const init = (el as Element & { shadowInit?: () => ShadowRootInit }).shadowInit?.();
    const delegates = init?.delegatesFocus === true;
    const attrs = [...el.attributes]
      .filter((a) => a.name !== 'data-fud-id' && !(a.name === 'class' && a.value === ''))
      .filter((a) => !(delegates && a.name === 'tabindex'))
      .map((a) => `${a.name}=${JSON.stringify(a.value)}`)
      .sort();
    out.push(`${pad}<${el.namespaceURI === 'http://www.w3.org/1999/xhtml' ? '' : `${el.namespaceURI}:`}${el.localName}${attrs.map((a) => ` ${a}`).join('')}>`);
    if (el.shadowRoot !== null) {
      out.push(`${pad}  #shadow`);
      walk(el.shadowRoot, depth + 2, out);
    }
    walk(el, depth + 1, out);
  }
  flush();
}

/**
 * The props each component is mounted with, one set that leaves its blocks closed and one that
 * opens them, where its props decide them; `{}` for the ones not named here. A block that opens
 * on a component's own state is compared in the state it starts in.
 */
const PROPS: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
  'app-card': [
    { title: 'Corto', href: '/a' },
    { title: 'Un título largo, destacado', href: '/b', variant: 'highlight' },
  ],
  'app-marco': [{ titulo: 'Marco' }],
  'app-badge': [{}, { tone: 'success' }],
  'app-counter': [{}, { start: 7 }],
  'bus-option': [{}, { label: 'Uno', picked: true }],
  'bus-picker': [{}, { options: [{ label: 'a', picked: false }, { label: 'b', picked: true }] }],
  'form-errores': [
    {},
    {
      issues: [
        { path: 'nombre', message: 'Falta el nombre', href: '#nombre' },
        { path: '', message: 'Algo general' },
      ],
    },
  ],
  'site-nav': [{}, { current: '/vivo' }],
  'value-display': [{}, { value: 3 }],
  'vista-tareas': [
    {},
    {
      inicial: [
        { id: 1, titulo: 'Una', prioridad: 1, hecha: true, estado: 'ok', creada: new Date('2026-11-01T10:00:00Z') },
        { id: 2, titulo: 'Dos', prioridad: 2, hecha: false, estado: 'no', creada: new Date('2026-12-01T10:00:00Z') },
      ],
    },
  ],
  'vivo-item': [{}, { label: 'item' }],
  'vivo-otro': [{}, { label: 'otro' }],
};

/**
 * The components that only live inside another one, which is where they are compared: what they
 * take is the parent's — a control of its form, a signal of its own, a service it provides — and
 * none of that is a prop a page can write. Each one is in the tree of the parent named here.
 */
const INSIDE: Readonly<Record<string, string>> = {
  'app-field': 'app-form',
  'app-input': 'app-form',
  'signal-display': 'signal-counter',
  'signal-grandchild': 'signal-counter',
};

/**
 * The owner of a service, and what injects it: the provider of a component lives in its IoC
 * module, which only a page that painted the owner loads (SDD-38 §4.5), so an owner created in
 * the browser hands its subtree no container. Not this SDD's: it was so with the old `c` too.
 */
const OWNED = new Set(['di-owner', 'di-panel', 'di-badge']);

describe('criterion 8 — what the browser creates is what the server paints', () => {
  test('every component that lives only inside another is inside it', () => {
    for (const [tag, parent] of Object.entries(INSIDE)) {
      const host = Object.values(modules).find((m) => m.tag === parent)!;
      expect(host, `${tag} inside ${parent}`).toBeDefined();
    }
  });

  for (const [file, module] of Object.entries(modules)) {
    if (module.tag in INSIDE || OWNED.has(module.tag)) continue;
    for (const props of PROPS[module.tag] ?? [{}]) {
      test(`${file.slice('./components/'.length)} ${JSON.stringify(props)}`, async () => {
        const painted = await mount(module, { props });
        const created = await mount(module, { props, via: 'client' });
        expect(tree(created.root)).toBe(tree(painted.root));
      });
    }
  }
});
