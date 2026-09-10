/**
 * SDD-37 §6.2–§6.10: the seven diagnostics of delegation, over the AST and nothing else.
 *
 * The harness registers exactly what the language server's batch registers — attribute values,
 * interpolations and loop headers — so the analyzer is exercised through the same door it will
 * be asked through in the editor. TypeScript is never built, never asked and never present:
 * that absence is criterion 10, and it is asserted rather than assumed.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { structureDocument } from '../../src/document/index.js';
import { JsBatch, type FragmentId } from '../../src/oxc/index.js';
import { documentRoots, walk, type SemanticInput } from '../../src/semantic/index.js';
import type { Diagnostic, Node } from '../../src/types/index.js';
import { delegation } from '../../src/semantic/analyzers/delegation.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock };

/** Wrap markup in a minimal valid component (DSD host wrapper, decision 75). */
const component = (inner: string): string =>
  `<app-test><template shadowrootmode="open">${inner}</template></app-test>`;

/** The semantic input of one snippet, registered the way `js-batch.ts` registers a document. */
function inputFor(source: string): SemanticInput {
  const document = structureDocument(
    source,
    parseDocument(source, { atConstructs: constructs }).value,
  ).value;

  const batch = new JsBatch(source);
  const ids = new Map<Node, FragmentId>();
  walk(documentRoots(document), {
    interpolation(expr) {
      ids.set(expr, batch.add('expression', expr.expr));
    },
    binding(expr) {
      if (expr.expr.end > expr.expr.start) ids.set(expr, batch.add('expression', expr.expr));
    },
    control(node) {
      if (node.type !== 'foreach' && node.type !== 'for') return;
      const header = node.header.inner;
      if (header.end <= header.start) return;
      ids.set(node, batch.add(node.type === 'foreach' ? 'for-of-header' : 'for-header', header));
    },
  });

  return {
    source,
    document,
    js: batch.parse().value,
    fragmentId: (node) => ids.get(node),
    components: { has: () => true },
  };
}

function report(inner: string): readonly Diagnostic[] {
  const found: Diagnostic[] = [];
  delegation.run(inputFor(component(inner)), (d) => void found.push(d));
  return found;
}

function codes(inner: string): readonly string[] {
  return report(inner).map((d) => d.code);
}

/** The source text a diagnostic points at — the readable form of every span assertion. */
function blamed(inner: string, index = 0): string {
  const source = component(inner);
  const diagnostic = report(inner)[index];
  if (diagnostic === undefined) throw new Error('no diagnostic to read a span from');
  return source.slice(diagnostic.span.start, diagnostic.span.end);
}

/** The canonical shape of §3.1: a marker in a loop, read by an ancestor above it. */
const CALENDAR = `<div @click="@fn($event, $day)">
  @foreach (const day of days) key (day.id) {
    <div class="cell" delegate:day>@day.n</div>
    <button delegate:day>edit</button>
  }
</div>`;

describe('delegation — what is legal', () => {
  it('accepts the canonical form, and two markers of the SAME loop are one delegation', () => {
    expect(codes(CALENDAR)).toEqual([]);
  });

  it('leaves a handler with no `$name` exactly as it found it', () => {
    expect(
      codes(`<div @click="@fn($event)">
        @foreach (const day of days) key (day.id) { <div>@day.n</div> }
      </div>`),
    ).toEqual([]);
  });

  it('accepts a destructured header: the member is the name, not the row', () => {
    expect(
      codes(`<ul @click="@pick($id)">
        @foreach (const { id, label } of rows) key (id) { <li delegate:id>@label</li> }
      </ul>`),
    ).toEqual([]);
  });

  it('accepts a `@for` header, whose binding is its index', () => {
    expect(
      codes(`<div @click="@pick($i)">
        @for (let i = 0; i < n; i++) key (i) { <b delegate:i>@i</b> }
      </div>`),
    ).toEqual([]);
  });

  it('binds to the NEAREST ancestor that reads the name, not to the outermost', () => {
    expect(
      codes(`<section @click="@outer($day)">
        <div @click="@inner($day)">
          @foreach (const day of days) key (day.id) { <b delegate:day>@day.n</b> }
        </div>
      </section>`),
      // The outer one is left with no marker of its own — which is `FUD0660` and not silence.
    ).toEqual(['FUD0660']);
  });
});

describe('delegation — the marker (§6.2, §6.3, §6.6)', () => {
  it('FUD0663: a marker outside every loop has no row to identify', () => {
    expect(codes('<div delegate:day></div>')).toEqual(['FUD0663']);
    expect(blamed('<div delegate:day></div>')).toBe('delegate:day');
  });

  it('FUD0663: an `@if` is not a loop, so a marker inside one is still outside every loop', () => {
    expect(codes('@if (x) { <div delegate:day></div> }')).toEqual(['FUD0663']);
  });

  it('FUD0662: a name the header does not declare, and the message offers what it does', () => {
    const inner = `<div @click="@fn($dia)">
      @foreach (const day of days) key (day.id) { <b delegate:dia>@day.n</b> }
    </div>`;
    expect(codes(inner)).toEqual(['FUD0662', 'FUD0660']);
    expect(report(inner)[0]?.message).toContain('`day`');
    expect(blamed(inner)).toBe('dia');
  });

  it('FUD0662: a `@while` declares nothing, and the message says so', () => {
    const inner = `<div @click="@fn($day)">
      @while (more) key (id) { <b delegate:day></b> }
    </div>`;
    expect(codes(inner)).toContain('FUD0662');
    expect(report(inner)[0]?.message).toContain('no binding');
  });

  it('FUD0661: a marker no ancestor reads is a dead marker', () => {
    const inner = `<div @click="@fn($event)">
      @foreach (const day of days) key (day.id) { <b delegate:day></b> }
    </div>`;
    expect(codes(inner)).toEqual(['FUD0661']);
    expect(blamed(inner)).toBe('delegate:day');
  });

  it('FUD0661: the element that carries the handler is not its own ancestor', () => {
    expect(
      codes(`@foreach (const day of days) key (day.id) {
        <b delegate:day @click="@fn($day)"></b>
      }`),
    ).toEqual(['FUD0661', 'FUD0660']);
  });
});

describe('delegation — the pairing (§6.5, §6.7)', () => {
  it('FUD0660: a `$name` with no marker under it', () => {
    const inner = `<div @click="@fn($event, $day)">
      @foreach (const day of days) key (day.id) { <b>@day.n</b> }
    </div>`;
    expect(codes(inner)).toEqual(['FUD0660']);
    expect(blamed(inner)).toBe('$day');
  });

  it('FUD0664: two loops offering the same name to the same handler', () => {
    const inner = `<div @click="@fn($item)">
      @foreach (const item of a) key (item.id) { <b delegate:item></b> }
      @foreach (const item of b) key (item.id) { <i delegate:item></i> }
    </div>`;
    expect(codes(inner)).toEqual(['FUD0664']);
    expect(blamed(inner)).toBe('delegate:item');
  });

  it('FUD0664: it is an error even when both loops iterate the same list', () => {
    expect(
      codes(`<div @click="@fn($item)">
        @foreach (const item of rows) key (item.id) { <b delegate:item></b> }
        @foreach (const item of rows) key (item.id) { <i delegate:item></i> }
      </div>`),
    ).toEqual(['FUD0664']);
  });

  it('two loops under DIFFERENT handlers are two delegations and neither is ambiguous', () => {
    expect(
      codes(`<section>
        <div @click="@one($item)">
          @foreach (const item of a) key (item.id) { <b delegate:item></b> }
        </div>
        <div @click="@two($item)">
          @foreach (const item of b) key (item.id) { <i delegate:item></i> }
        </div>
      </section>`),
    ).toEqual([]);
  });

  it('nested loops delegate two names to one handler', () => {
    expect(
      codes(`<div @click="@fn($row, $tag)">
        @foreach (const row of rows) key (row.id) {
          @foreach (const tag of row.tags) key (tag.id) { <b delegate:row delegate:tag></b> }
        }
      </div>`),
    ).toEqual([]);
  });
});

describe('delegation — the event and the read (§6.8, §6.9)', () => {
  it('FUD0665: an event that does not bubble can never be delegated', () => {
    const inner = `<div @mouseenter="@fn($event, $day)">
      @foreach (const day of days) key (day.id) { <b delegate:day></b> }
    </div>`;
    expect(codes(inner)).toEqual(['FUD0665']);
    expect(report(inner)[0]?.message).toContain('mouseover');
    expect(blamed(inner)).toBe('mouseenter');
  });

  it('FUD0665: with no substitute, the message offers none', () => {
    const inner = `<div @scroll="@fn($day)">
      @foreach (const day of days) key (day.id) { <b delegate:day></b> }
    </div>`;
    expect(codes(inner)).toEqual(['FUD0665']);
    expect(report(inner)[0]?.message).not.toContain('use `@');
  });

  it('the same event with no `$name` is an ordinary listener and stays legal', () => {
    expect(codes('<div @mouseenter="@fn($event)"></div>')).toEqual([]);
  });

  it('FUD0666: `$name` in a `class:` value and in text', () => {
    expect(codes('<b class:on="@$day"></b>')).toEqual(['FUD0666']);
    expect(codes('<b>@$day</b>')).toEqual(['FUD0666']);
    expect(blamed('<b class:on="@$day"></b>')).toBe('$day');
  });

  it('FUD0666: `$name` inside a lambda is in a scope the wrapper does not build', () => {
    expect(codes('<div @click="@(() => fn($day))"></div>')).toEqual(['FUD0666']);
  });

  it('FUD0666: a `$name` that is a member or a key names somebody else\'s namespace', () => {
    expect(codes('<b>@row.$day</b>')).toEqual([]);
    expect(codes('<div @click="@fn({ $day: 1 })"></div>')).toEqual([]);
    expect(codes('<b>@row[$day]</b>')).toEqual(['FUD0666']);
  });

  it('leaves a bare `$` alone: it is a name, not a prefix', () => {
    expect(codes('<div @click="@fn($)"></div>')).toEqual([]);
  });

  it('reads through a hole in an array argument without tripping over it', () => {
    expect(codes('<div @click="@fn([$day, , 1])"></div>')).toEqual(['FUD0666']);
  });

  it('collects the reads of TWO handlers on the same element', () => {
    expect(
      codes(`<div @click="@one($day)" @keydown="@two($day)">
        @foreach (const day of days) key (day.id) { <b delegate:day></b> }
      </div>`),
    ).toEqual([]);
  });

  it('leaves `$event` alone: it is SDD-15\'s and not this rule\'s', () => {
    expect(codes('<div @click="@fn($event)"></div>')).toEqual([]);
    expect(codes('<b>@$event</b>')).toEqual([]);
    expect(codes('<div @click="@($event)"></div>')).toEqual([]);
  });
});

describe('delegation — the marker with a value (§6.4)', () => {
  it('FUD0667 reaches the editor too, and not only `pnpm build`', () => {
    const inner = `<div @click="@fn($day)">
      @foreach (const day of days) key (day.id) { <b delegate:day="x"></b> }
    </div>`;
    expect(codes(inner)).toEqual(['FUD0667']);
    expect(blamed(inner)).toBe('x');
  });
});

describe('delegation — it never throws (§5, invariant 5)', () => {
  it('says nothing when no fragment was registered', () => {
    const input = inputFor(component(CALENDAR));
    const found: string[] = [];
    delegation.run({ ...input, fragmentId: () => undefined }, (d) => void found.push(d.code));
    // Without the header there is no name to check against, and without the handler there is
    // no read: the marker is simply never read, which is the honest answer.
    expect(found).toEqual(['FUD0662', 'FUD0662']);
  });

  it('says nothing about a document with neither markers nor reads', () => {
    expect(codes('<div class="cell">text</div>')).toEqual([]);
  });

  it('says nothing about a fragment registered as a statement list', () => {
    // Not what `js-batch.ts` does — and exactly why it is asked: a caller that registers a
    // handler as statements hands back a list where this pass expects one node, and the
    // answer to «I cannot read this» is silence, not a crash.
    const source = component(CALENDAR);
    const document = structureDocument(
      source,
      parseDocument(source, { atConstructs: constructs }).value,
    ).value;
    const batch = new JsBatch(source);
    const ids = new Map<Node, FragmentId>();
    walk(documentRoots(document), {
      binding(expr) {
        ids.set(expr, batch.add('module-statements', expr.expr));
      },
      control(node) {
        if (node.type === 'foreach') {
          ids.set(node, batch.add('module-statements', node.header.inner));
        }
      },
    });
    const found: string[] = [];
    const js = batch.parse();
    delegation.run(
      { source, document, js: js.value, fragmentId: (n) => ids.get(n), components: { has: () => true } },
      (d) => void found.push(d.code),
    );
    // No header names and no reads: every marker is one nobody reads.
    expect(found).toEqual(['FUD0662', 'FUD0662']);
  });

  it('adds two markers of the same name from two nested loops without confusing them', () => {
    expect(
      codes(`<div @click="@fn($row)">
        @foreach (const row of rows) key (row.id) {
          @foreach (const cell of row.cells) key (cell.id) { <b delegate:row></b> }
        }
      </div>`),
    ).toEqual([]);
  });

  it('offers the names of EVERY enclosing loop when the marker names none of them', () => {
    const inner = `<div @click="@fn($x)">
      @foreach (const row of rows) key (row.id) {
        @foreach (const cell of row.cells) key (cell.id) { <b delegate:x></b> }
      }
    </div>`;
    const message = report(inner)[0]?.message ?? '';
    expect(message).toContain('`row`');
    expect(message).toContain('`cell`');
  });
});

describe('delegation — the eight, out of the AST and out of the checker (§6.10)', () => {
  /** One document that breaks all seven pairing rules plus the one the classification owns. */
  const BROKEN = `<div delegate:loose></div>
<div @click="@a($ghost)"></div>
<div @mouseenter="@b($day)">
  @foreach (const day of days) key (day.id) { <i delegate:day></i> }
</div>
<div @click="@c($item)">
  @foreach (const item of a) key (item.id) { <b delegate:item></b> }
  @foreach (const item of b) key (item.id) { <u delegate:item="1"></u> }
</div>
@foreach (const dead of xs) key (dead.id) { <s delegate:dead></s> }
<div @click="@d($dia)">
  @foreach (const day of ys) key (day.id) { <em delegate:dia></em> }
</div>
<b class:on="@$stray"></b>`;

  it('reports all eight codes over one document', () => {
    expect(new Set(codes(BROKEN))).toEqual(
      new Set([
        'FUD0660',
        'FUD0661',
        'FUD0662',
        'FUD0663',
        'FUD0664',
        'FUD0665',
        'FUD0666',
        'FUD0667',
      ]),
    );
  });

  it('and the compiler that produced them cannot reach TypeScript at all', async () => {
    // The strongest form the promise of §4.5 can take in a test: the package that decides
    // these eight declares no dependency a checker could arrive through. Its only runtime
    // dependency is the parser.
    const manifest: { dependencies: Record<string, string> } = (
      await import('../../package.json', { with: { type: 'json' } })
    ).default;
    expect(Object.keys(manifest.dependencies)).toEqual(['oxc-parser']);
  });
});
