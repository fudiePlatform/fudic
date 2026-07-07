import { describe, expect, it } from 'vitest';
import { hydrateRoot, mountRoot, type Render, type RenderFactory } from '../src/index.js';

function blockFactory(calls: string[]): RenderFactory<Node> {
  return (dom, _ctx, target) => {
    const render: Render<Node> = {
      create() {
        calls.push('create');
        const p = dom.element('p');
        dom.append(p, dom.text('cold'));
        dom.append(target, p);
      },
      hydrate(cursor) {
        calls.push(cursor.seekComment('fud:block') === null ? 'hydrate:miss' : 'hydrate');
      },
      mount() {
        calls.push('mount');
      },
      update() {
        calls.push('update');
      },
      remove() {
        calls.push('remove');
      },
    };
    return render;
  };
}

describe('root bootstrap', () => {
  it('mountRoot cold-creates under the target, then mounts', () => {
    const target = document.createElement('div');
    document.body.append(target);
    const calls: string[] = [];
    const render = mountRoot(blockFactory(calls), null, target);
    expect(calls).toEqual(['create', 'mount']);
    expect(target.querySelector('p')?.textContent).toBe('cold');
    render.remove();
    expect(calls).toEqual(['create', 'mount', 'remove']);
  });

  it('hydrateRoot adopts the painted markup (anchor found), then mounts', () => {
    const target = document.createElement('div');
    target.innerHTML = '<!--fud:block--><p>ssr</p>';
    document.body.append(target);
    const calls: string[] = [];
    const render = hydrateRoot(blockFactory(calls), null, target);
    expect(calls).toEqual(['hydrate', 'mount']);
    expect(render).toBeDefined();
  });
});
