/**
 * The effective-level rule (SDD-15 §3.1): who hydrates. One case per assertion, because
 * each of them is a way the old rule («it declares a signal») was short.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { resolveComponents, hydratableTags, isIntrinsicallyHydratable } from '../../src/emit/index.js';
import { fixturesDir, fixtureIo, memoryIo } from './_support.js';

/** A page that links every component of `files` and instantiates `body`. */
function page(links: readonly string[], body: string): string {
  const head = links.map((t) => `<link rel="component" href="./${t}.fud">`).join('\n    ');
  return `<!DOCTYPE html>
<html>
  <head>
    ${head}
  </head>
  <body>${body}</body>
</html>
`;
}

/** A component file: its `@code` region and the markup of its own tag. */
function component(tag: string, code: string, markup: string): string {
  return `${code}
<${tag}>
  <template shadowrootmode="open">
${markup}
  </template>
</${tag}>
`;
}

function graphOf(files: Record<string, string>): ReturnType<typeof resolveComponents> {
  return resolveComponents('/app/home.fud', memoryIo(files));
}

describe('effective level — intrinsic', () => {
  it('a component whose only reactive is a signal hydrates', () => {
    const graph = graphOf({
      '/app/home.fud': page(['x-sig'], '<x-sig></x-sig>'),
      '/app/x-sig.fud': component(
        'x-sig',
        `@code {
  @client {
    import { signal } from '@fudic/core';
    const n = signal(0);
  }
}`,
        '<p>@(n())</p>',
      ),
    });
    expect(isIntrinsicallyHydratable(graph.components.get('x-sig')!)).toBe(true);
    expect([...hydratableTags(graph)]).toEqual(['x-sig']);
  });

  it('a component whose only reactive is a computed hydrates too', () => {
    // The case the old rule dropped: `computed` is as reactive as `signal`, and SDD-31 §4.7
    // put them in the same list precisely because the question has one answer for both.
    const graph = graphOf({
      '/app/home.fud': page(['x-derived'], '<x-derived></x-derived>'),
      '/app/x-derived.fud': component(
        'x-derived',
        `@code {
  const { n = 1 } = props<{ n?: number }>();
  const twice = computed(() => n * 2);
}`,
        '<p>@(twice())</p>',
      ),
    });
    expect(isIntrinsicallyHydratable(graph.components.get('x-derived')!)).toBe(true);
  });

  it('a component with a @click and no signal at all hydrates', () => {
    const graph = graphOf({
      '/app/home.fud': page(['x-click'], '<x-click></x-click>'),
      '/app/x-click.fud': component('x-click', '', '<button @click="@go">go</button>'),
    });
    expect(isIntrinsicallyHydratable(graph.components.get('x-click')!)).toBe(true);
  });

  it('a bus: subscription is hookup, and hookup hydrates', () => {
    const graph = graphOf({
      '/app/home.fud': page(['x-bus'], '<x-bus></x-bus>'),
      '/app/x-bus.fud': component('x-bus', '', '<ul bus:cleared="@onCleared($event)"></ul>'),
    });
    expect(isIntrinsicallyHydratable(graph.components.get('x-bus')!)).toBe(true);
  });

  it('a hookup binding inside an @if counts: the walk goes through the constructs', () => {
    const graph = graphOf({
      '/app/home.fud': page(['x-deep'], '<x-deep></x-deep>'),
      '/app/x-deep.fud': component(
        'x-deep',
        `@code {
  const { on = false } = props<{ on?: boolean }>();
}`,
        `    @if (on) {
      <button @click="@go">go</button>
    }`,
      ),
    });
    expect(isIntrinsicallyHydratable(graph.components.get('x-deep')!)).toBe(true);
  });

  it('a @code { @client } with a body hydrates, even one that moves nothing', () => {
    // The overapproximation, written down as a test: the compiler cannot know that a
    // `setInterval` in there moves something, so the burden of proof is on NOT hydrating.
    const graph = graphOf({
      '/app/home.fud': page(['x-inert'], '<x-inert></x-inert>'),
      '/app/x-inert.fud': component(
        'x-inert',
        `@code {
  @client {
    const x = 5;
  }
}`,
        '<p>nada</p>',
      ),
    });
    expect(isIntrinsicallyHydratable(graph.components.get('x-inert')!)).toBe(true);
  });

  it('a degraded component with no <template> is read for its @code and nothing else', () => {
    // FUD0157: the wrapper carries no `<template shadowrootmode>`. The level rule must not
    // throw over it — the emit reports and carries on, and a template that is not there
    // holds no hookup.
    const graph = graphOf({
      '/app/home.fud': page(['x-broken'], '<x-broken></x-broken>'),
      '/app/x-broken.fud': '<x-broken>\n  <p>sin template</p>\n</x-broken>\n',
    });
    expect(isIntrinsicallyHydratable(graph.components.get('x-broken')!)).toBe(false);
    expect([...hydratableTags(graph)]).toEqual([]);
  });

  it('app-badge as it stands — props and class:, no @client — does NOT hydrate', () => {
    const graph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);
    expect(isIntrinsicallyHydratable(graph.components.get('app-badge')!)).toBe(false);
    expect(isIntrinsicallyHydratable(graph.components.get('app-list')!)).toBe(false);
    expect([...hydratableTags(graph)].sort()).toEqual(['app-actions', 'app-button', 'app-card']);
  });
});

describe('effective level — induced', () => {
  it('a child that receives a reactive prop hydrates, with nothing of its own', () => {
    const graph = graphOf({
      '/app/home.fud': page(['x-parent'], '<x-parent></x-parent>'),
      '/app/x-parent.fud':
        '<link rel="component" href="./x-badge.fud">\n' +
        component(
          'x-parent',
          `@code {
  @client {
    import { signal } from '@fudic/core';
    const tone = signal('success');
  }
}`,
          '<x-badge .tone="@tone"></x-badge>',
        ),
      '/app/x-badge.fud': component(
        'x-badge',
        `@code {
  const { tone = 'neutral' } = props<{ tone?: string }>();
}`,
        '<span>@tone</span>',
      ),
    });
    expect(isIntrinsicallyHydratable(graph.components.get('x-badge')!)).toBe(false);
    expect([...hydratableTags(graph)].sort()).toEqual(['x-badge', 'x-parent']);
  });

  it('a constant prop induces nothing: `.tone="success"` cannot move', () => {
    const graph = graphOf({
      '/app/home.fud': page(['x-parent'], '<x-parent></x-parent>'),
      '/app/x-parent.fud':
        '<link rel="component" href="./x-badge.fud">\n' +
        component(
          'x-parent',
          `@code {
  @client {
    import { signal } from '@fudic/core';
    const tone = signal('success');
  }
}`,
          '<x-badge .tone="success"></x-badge>',
        ),
      '/app/x-badge.fud': component(
        'x-badge',
        `@code {
  const { tone = 'neutral' } = props<{ tone?: string }>();
}`,
        '<span>@tone</span>',
      ),
    });
    expect([...hydratableTags(graph)]).toEqual(['x-parent']);
  });

  it('a value that READS a signal induces hydration: it moves when the signal does', () => {
    // This case used to assert the opposite, and the belief behind it was wrong: `tone() + "!"`
    // is recomputed every time `tone` moves, so the child is handed a new value and has to be
    // alive to receive it. Reading it as "crossed once" left the child at level 1, and then the
    // parent's handover found an element with no `u` on it — a `TypeError` in the browser, which
    // is how the example page of `.value="@(count())"` was found dead.
    //
    // Being a bare name is a different question, and it decides something else: only a name
    // buys the sparse channel of BUG-18. A compound expression is renewed by the update pass.
    const graph = graphOf({
      '/app/home.fud': page(['x-parent'], '<x-parent></x-parent>'),
      '/app/x-parent.fud':
        '<link rel="component" href="./x-badge.fud">\n' +
        component(
          'x-parent',
          `@code {
  @client {
    import { signal } from '@fudic/core';
    const tone = signal('success');
  }
}`,
          `<x-badge .tone="@(tone() + '!')"></x-badge>`,
        ),
      '/app/x-badge.fud': component(
        'x-badge',
        `@code {
  const { tone = 'neutral' } = props<{ tone?: string }>();
}`,
        '<span>@tone</span>',
      ),
    });
    expect([...hydratableTags(graph)].sort()).toEqual(['x-badge', 'x-parent']);
  });

  it('a value that reads nothing at all still induces nothing', () => {
    // The line between the two is what the expression READS, not how it is spelled: a literal
    // has no free reference into the component, so it is a constant in the exact sense
    // decision 75 means, and the child stays level 1.
    const graph = graphOf({
      '/app/home.fud': page(['x-parent'], '<x-parent></x-parent>'),
      '/app/x-parent.fud':
        '<link rel="component" href="./x-badge.fud">\n' +
        component(
          'x-parent',
          `@code {
  @client {
    import { signal } from '@fudic/core';
    const tone = signal('success');
  }
}`,
          `<x-badge .tone="@('a' + 'b')"></x-badge>`,
        ),
      '/app/x-badge.fud': component(
        'x-badge',
        `@code {
  const { tone = 'neutral' } = props<{ tone?: string }>();
}`,
        '<span>@tone</span>',
      ),
    });
    expect([...hydratableTags(graph)]).toEqual(['x-parent']);
  });

  it('three levels: the middle only forwards the prop, and the grandchild still hydrates', () => {
    // The case that fails WITHOUT a fixed point: `x-mid` has nothing of its own, so it only
    // becomes a reactive source once the first pass has marked its own prop reactive.
    const graph = graphOf({
      '/app/home.fud': page(['x-top'], '<x-top></x-top>'),
      '/app/x-top.fud':
        '<link rel="component" href="./x-mid.fud">\n' +
        component(
          'x-top',
          `@code {
  @client {
    import { signal } from '@fudic/core';
    const n = signal(0);
  }
}`,
          '<x-mid .value="@n"></x-mid>',
        ),
      '/app/x-mid.fud':
        '<link rel="component" href="./x-leaf.fud">\n' +
        component(
          'x-mid',
          `@code {
  const { value = 0 } = props<{ value?: number }>();
}`,
          '<x-leaf .value="@value"></x-leaf>',
        ),
      '/app/x-leaf.fud': component(
        'x-leaf',
        `@code {
  const { value = 0 } = props<{ value?: number }>();
}`,
        '<p>@value</p>',
      ),
    });
    expect([...hydratableTags(graph)].sort()).toEqual(['x-leaf', 'x-mid', 'x-top']);
  });

  it('a light-DOM child of the PAGE is not induced by anyone', () => {
    // The page declares no reactive at all, so nothing it writes on a host can move.
    const graph = graphOf({
      '/app/home.fud': page(['x-badge'], '<x-badge .tone="@data.tone"></x-badge>'),
      '/app/x-badge.fud': component(
        'x-badge',
        `@code {
  const { tone = 'neutral' } = props<{ tone?: string }>();
}`,
        '<span>@tone</span>',
      ),
    });
    expect([...hydratableTags(graph)]).toEqual([]);
  });
});
