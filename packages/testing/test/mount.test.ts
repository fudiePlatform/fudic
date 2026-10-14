import { describe, expect, test } from 'vitest';
import { HYDRATED_EVENT } from '@fudic/core';
import { mount, renderToHtml } from '../src/index.js';
import * as XCounter from './fixtures/x-counter.fud';
import * as XGreeting from './fixtures/x-greeting.fud';
import * as XLabel from './fixtures/x-label.fud';
import fixtures from './fixtures/x-greeting.fixture';
import { GREETING } from './fixtures/greeting';
import * as XInjected from './fixtures/x-injected.fud';
import * as XOwner from './fixtures/x-owner.fud';
import * as XPair from './fixtures/x-pair.fud';

/** The tags that report `fud:hydrated` from now on. */
function hydrations(): string[] {
  const tags: string[] = [];
  document.addEventListener(HYDRATED_EVENT, (e) => tags.push((e as CustomEvent<{ tag: string }>).detail.tag));
  return tags;
}

describe('criterion 3: an N1 component', () => {
  test('mounts with its root and the text of its props', async () => {
    const t = await mount(XGreeting, { props: { name: 'Ana' } });
    expect(t.host.localName).toBe('x-greeting');
    expect(t.root).toBe(t.host.shadowRoot);
    expect(t.root.querySelector('p')!.textContent).toBe('Hello, Ana');
  });

  test('the HTML is the server’s: its sheet is adopted, and its page is the document', async () => {
    const t = await mount(XGreeting);
    expect(t.root.adoptedStyleSheets).toHaveLength(1);
    expect(t.root.querySelector('p')!.textContent).toBe('Hello, nobody');
    expect(document.documentElement.lang).toBe('es');
  });
});

describe('criterion 4: an N3 component', () => {
  test('the first click on a host nobody hydrated raises it, and counts', async () => {
    const t = await mount(XCounter, { props: { start: 2 } });
    const hydrated = hydrations();
    t.root.querySelector('button')!.click();
    await t.settled();
    expect(hydrated).toEqual(['x-counter']);
    expect(t.root.querySelector('output')!.textContent).toBe('3');
  });
});

describe('criterion 5: props', () => {
  test('via client, t.props repaints what depends on the prop', async () => {
    const t = await mount(XLabel, { via: 'client', props: { label: 'one' } });
    await t.props({ label: 'two' });
    expect(t.root.querySelector('span')!.textContent).toBe('two');
  });

  test('a prop the component does not declare is the test’s mistake', async () => {
    await expect(mount(XLabel, { props: { nope: 1 } })).rejects.toThrow('<x-label> declares no prop "nope"');
    const t = await mount(XLabel, { via: 'client' });
    await expect(t.props({ nope: 1 } as never)).rejects.toThrow('<x-label> declares no prop "nope"');
  });
});

describe('criterion 7: a .fudspec fixture', () => {
  test('serves as props', async () => {
    const t = await mount(XGreeting, { props: fixtures.formal });
    expect(t.root.querySelector('p')!.className).toBe('formal');
    expect(t.root.querySelector('p')!.textContent).toBe('Hello, Sra. Ruiz');
  });
});

describe('criterion 8: providers', () => {
  const fake = [{ provide: GREETING, use: () => 'from the fake' }];

  test('take the place of a service the component injects', async () => {
    const t = await mount(XInjected, { via: 'client', providers: fake });
    expect(t.root.querySelector('p')!.textContent).toBe('from the fake');
  });

  test('without them, the real one answers', async () => {
    const t = await mount(XInjected, { via: 'client' });
    expect(t.root.querySelector('p')!.textContent).toBe('from the real service');
  });

  test('via ssr, the page’s tree stands with them before the first chunk is raised', async () => {
    const t = await mount(XOwner, { providers: fake });
    expect(document.getElementById('fud-ioc')).not.toBeNull();
    const child = t.root.querySelector('x-injected')!;
    expect(child.shadowRoot!.querySelector('p')!.textContent).toBe('from the owner');
    child.shadowRoot!.querySelector('button')!.click();
    await t.settled();
    expect(child.shadowRoot!.querySelector('button')!.textContent).toBe('1');
  });
});

describe('via client', () => {
  test('creates the element as a parent does, with its props in order', async () => {
    const t = await mount(XCounter, { via: 'client', props: { start: 5 } });
    expect(t.host.parentElement).toBe(document.body);
    expect(t.root.querySelector('output')!.textContent).toBe('5');
    t.root.querySelector('button')!.click();
    await t.settled();
    expect(t.root.querySelector('output')!.textContent).toBe('6');
  });

  test('takes a prop that is not JSON', async () => {
    const label = { toString: () => 'object' };
    const t = await mount(XLabel, { via: 'client', props: { label } });
    expect(t.root.querySelector('span')!.textContent).toBe('object');
  });

  test('an N1 component comes up the same way', async () => {
    const t = await mount(XGreeting, { via: 'client', props: { name: 'Eva' } });
    expect(t.root.querySelector('p')!.textContent).toBe('Hello, Eva');
  });
});

describe('via ssr', () => {
  test('a prop that is not JSON is named in the error', async () => {
    await expect(mount(XLabel, { props: { label: new Date(0) } })).rejects.toThrow(
      `mount(<x-label>): prop "label" is not JSON, and via 'ssr' renders it on the server — mount it with via: 'client'`,
    );
    await expect(mount(XLabel, { props: { label: undefined } })).rejects.toThrow('prop "label" is not JSON');
  });

  test('the same page twice is written once', async () => {
    const a = await mount(XGreeting, { props: { name: 'twice' } });
    const b = await mount(XGreeting, { props: { name: 'twice' } });
    expect(a.host).not.toBe(b.host);
    expect(b.root.querySelector('p')!.textContent).toBe('Hello, twice');
  });
});

describe('the page', () => {
  test('lives at http://localhost/ by default, or at the url it is given', async () => {
    await mount(XGreeting);
    expect(location.href).toBe('http://localhost/');
    await mount(XGreeting, { url: '/usuarios?page=2' });
    expect(location.href).toBe('http://localhost/usuarios?page=2');
  });

  test('unmount takes the component out', async () => {
    const t = await mount(XGreeting);
    t.unmount();
    expect(t.host.isConnected).toBe(false);
  });
});

describe('a page with two instances of one tag', () => {
  test('the first gesture raises both; the second one finds its tag already up', async () => {
    const t = await mount(XPair);
    const [first, second] = [...t.root.querySelectorAll('x-counter')].map((c) => c.shadowRoot!);
    first!.querySelector('button')!.click();
    await t.settled();
    second!.querySelector('button')!.click();
    await t.settled();
    expect(first!.querySelector('output')!.textContent).toBe('11');
    expect(second!.querySelector('output')!.textContent).toBe('21');
  });
});

describe('renderToHtml', () => {
  test('the page the server answers, with its props painted, and no DOM touched', async () => {
    const html = await renderToHtml(XGreeting, { props: { name: 'Ana' } });
    expect(html).toContain('Hello, Ana');
    expect(document.body.childElementCount).toBe(0);
    await expect(renderToHtml(XGreeting, { props: { name: () => 'x' } })).rejects.toThrow('prop "name" is not JSON');
  });
});
