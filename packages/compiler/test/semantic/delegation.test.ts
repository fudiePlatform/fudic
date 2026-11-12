/**
 * SDD-37 §6.2–§6.10 and SDD-72 §3.4–§3.5: the diagnostics of delegation, over the AST and
 * nothing else.
 *
 * Since decisions 176–177 a marker may list the events it serves, the pairing is per event, and
 * the row is read by its plain name anywhere in the handler's arguments; `$day` is the retired
 * spelling (`FUD1383`). The harness registers exactly what the language server's batch registers
 * — attribute values, interpolations and loop headers — so the analyzer is exercised through the
 * same door it will be asked through in the editor. TypeScript is never built, never asked and
 * never present: that absence is criterion 10, and it is asserted rather than assumed.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { structureDocument } from '../../src/document/index.js';
import { JsBatch, type FragmentId, type OxcNode } from '../../src/oxc/index.js';
import { eventsReadingRow, handlerAt } from '../../src/semantic/delegation.js';
import { documentRoots, walk, type SemanticInput } from '../../src/semantic/index.js';
import type { Diagnostic, Node } from '../../src/types/index.js';
import { delegation } from '../../src/semantic/analyzers/delegation.js';
import { attributeBindings } from '../../src/semantic/analyzers/attribute-bindings.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock };

/** Wrap markup in a minimal valid component (DSD host wrapper, decision 75), with an optional `@code`. */
const component = (inner: string, code?: string): string =>
  `${code === undefined ? '' : `@code {\n${code}\n}\n`}<app-test><template shadowrootmode="open">${inner}</template></app-test>`;

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

function report(inner: string, code?: string): readonly Diagnostic[] {
  const found: Diagnostic[] = [];
  delegation.run(inputFor(component(inner, code)), (d) => void found.push(d));
  return found;
}

/**
 * With the classification's analyzer in front, as `ANALYZERS` runs them: `FUD0667`, a marker
 * whose value is not an event list, is the classification's (SDD-62), not the delegation rule's.
 */
function withBindings(inner: string): readonly string[] {
  const found: Diagnostic[] = [];
  const input = inputFor(component(inner));
  attributeBindings.run(input, (d) => void found.push(d));
  delegation.run(input, (d) => void found.push(d));
  return found.map((d) => d.code);
}

function codes(inner: string, code?: string): readonly string[] {
  return report(inner, code).map((d) => d.code);
}

/** The source text a diagnostic points at — the readable form of every span assertion. */
function blamed(inner: string, index = 0, code?: string): string {
  const source = component(inner, code);
  const diagnostic = report(inner, code)[index];
  if (diagnostic === undefined) throw new Error('no diagnostic to read a span from');
  return source.slice(diagnostic.span.start, diagnostic.span.end);
}

/** The canonical shape of §3.1: a marker in a loop, read by an ancestor above it. */
const CALENDAR = `<div @click="@fn($event, day)">
  @foreach (const day of days) key (day.id) {
    <div class="cell" delegate:day>@day.n</div>
    <button delegate:day>edit</button>
  }
</div>`;

/** The table of SDD-72 §3.4: a checkbox and a button per row, each marked for its own event. */
const TABLE = `<tbody @change=@activar(p, $event) @click=@borrar(p)>
  @foreach (const p of personas) key (p.id) {
    <tr>
      <td><input type="checkbox" delegate:p="change"></td>
      <td><button delegate:p="click">Borrar</button></td>
    </tr>
  }
</tbody>`;

describe('delegation — what is legal', () => {
  it('accepts the canonical form, and two markers of the SAME loop are one delegation', () => {
    expect(codes(CALENDAR)).toEqual([]);
  });

  it('leaves a handler that names no marked row exactly as it found it', () => {
    expect(
      codes(`<div @click="@fn($event)">
        @foreach (const day of days) key (day.id) { <div>@day.n</div> }
      </div>`),
    ).toEqual([]);
  });

  it('accepts a destructured header: the member is the name, not the row', () => {
    expect(
      codes(`<ul @click="@pick(id)">
        @foreach (const { id, label } of rows) key (id) { <li delegate:id>@label</li> }
      </ul>`),
    ).toEqual([]);
  });

  it('accepts a `@for` header, whose binding is its index', () => {
    expect(
      codes(`<div @click="@pick(i)">
        @for (let i = 0; i < n; i++) key (i) { <b delegate:i>@i</b> }
      </div>`),
    ).toEqual([]);
  });

  it('binds to the NEAREST ancestor that reads the name, not to the outermost', () => {
    expect(
      codes(`<section @click="@outer(day)">
        <div @click="@inner(day)">
          @foreach (const day of days) key (day.id) { <b delegate:day>@day.n</b> }
        </div>
      </section>`),
      // The outer one is left with no marker of its own — which is `FUD0660` and not silence.
    ).toEqual(['FUD0660']);
  });

  it('accepts the table of §3.4: one marker per event (criterion 35)', () => {
    expect(codes(TABLE)).toEqual([]);
  });

  it('a marker may serve several events at once', () => {
    expect(
      codes(`<ul @click=@pick(day) @keydown=@key(day)>
        @foreach (const day of days) key (day.id) { <li delegate:day="click keydown"></li> }
      </ul>`),
    ).toEqual([]);
  });
});

describe('delegation — the row in any argument, one marker per variable (decision 177, criteria 41, 44, 45)', () => {
  it('reads the row inside any expression of the arguments', () => {
    expect(
      codes(`<tbody @click=@borrar(p.id, p.name, \`\${p.name}!\`, p.tags.length)>
        @foreach (const p of personas) key (p.id) { <tr><td><button delegate:p="click">x</button></td></tr> }
      </tbody>`),
    ).toEqual([]);
  });

  it('a property name or a key is not the row (criterion 44)', () => {
    // Neither `x.p` nor `{ p: 1 }` mention the row, so the handler reads none and the marker
    // is read by nobody.
    const member = `<div @click=@f(x.p)>
      @foreach (const p of ps) key (p.id) { <b delegate:p></b> }
    </div>`;
    expect(codes(member)).toEqual(['FUD0661']);
    const key = `<div @click=@f({ p: 1 })>
      @foreach (const p of ps) key (p.id) { <b delegate:p></b> }
    </div>`;
    expect(codes(key)).toEqual(['FUD0661']);
  });

  it('a shorthand property is a read: its value is the row', () => {
    expect(
      codes(`<div @click=@f({ p })>
        @foreach (const p of ps) key (p.id) { <b delegate:p></b> }
      </div>`),
    ).toEqual([]);
  });

  it('a function inside the arguments that declares the name hides it, shorthand included', () => {
    expect(
      codes(`<div @click=@f((p) => p.id)>
        @foreach (const p of ps) key (p.id) { <b delegate:p></b> }
      </div>`),
    ).toEqual(['FUD0661']);
    expect(
      codes(`<div @click=@f(function (p) { return { p }; })>
        @foreach (const p of ps) key (p.id) { <b delegate:p></b> }
      </div>`),
    ).toEqual(['FUD0661']);
  });

  it('a marker whose ancestors read only OTHER rows is read by nobody', () => {
    expect(
      codes(`<div @click=@f(a)>
        @foreach (const a of as) key (a.id) {
          <i delegate:a></i>
          @foreach (const b of a.bs) key (b.id) { <u delegate:b></u> }
        }
      </div>`),
    ).toEqual(['FUD0661']);
  });

  it('two variables of the row, one marker each (criterion 45)', () => {
    expect(
      codes(`<tbody @click=@borrar(p.id, i)>
        @foreach (const [i, p] of personas.entries()) key (p.id) {
          <tr><td><button delegate:p="click" delegate:i="click">x</button></td></tr>
        }
      </tbody>`),
    ).toEqual([]);
  });

  it('a fixed value is no row and needs no marker (criterion 45)', () => {
    expect(
      codes(`<tbody @click=@borrar(p.id, 123)>
        @foreach (const p of personas) key (p.id) { <tr><td><button delegate:p="click">x</button></td></tr> }
      </tbody>`),
    ).toEqual([]);
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
    const inner = `<div @click="@fn(dia)">
      @foreach (const day of days) key (day.id) { <b delegate:dia>@day.n</b> }
    </div>`;
    expect(codes(inner)).toEqual(['FUD0662', 'FUD0660']);
    expect(report(inner)[0]?.message).toContain('`day`');
    expect(blamed(inner)).toBe('dia');
  });

  it('FUD0662: a `@while` declares nothing, and the message says so', () => {
    const inner = `<div @click="@fn(day)">
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
    // Its `day` is the loop's own, an ordinary argument: no row is read, so no FUD0660 either.
    expect(
      codes(`@foreach (const day of days) key (day.id) {
        <b delegate:day @click="@fn(day)"></b>
      }`),
    ).toEqual(['FUD0661']);
  });
});

describe('delegation — the marker with its events (decision 176, criteria 35, 37)', () => {
  it('FUD1381: a listed event no ancestor handler of that event reads the name in, on the value (criterion 37)', () => {
    const inner = `<div @click=@fn(p)>
      @foreach (const p of ps) key (p.id) { <b delegate:p="click input"></b> }
    </div>`;
    expect(codes(inner)).toEqual(['FUD1381']);
    expect(blamed(inner)).toBe('click input');
    expect(report(inner)[0]?.message).toBe(
      'no ancestor `@input` reads `p`: this marker serves an event nobody listens to',
    );
  });

  it('FUD1381 with no handler at all, and the read of another event has no table: FUD0660', () => {
    const inner = `<div @click=@fn(p)>
      @foreach (const p of ps) key (p.id) { <b delegate:p="input"></b> }
    </div>`;
    expect(codes(inner)).toEqual(['FUD1381', 'FUD0660']);
    expect(blamed(inner, 1)).toBe('p');
    expect(report(inner)[1]?.message).toBe('no `delegate:p` below serves `@click`: `p` would have no row to read');
  });

  it('per event, the marker goes to the nearest ancestor with a handler of THAT event', () => {
    // The click goes to the inner div, the change to the outer section: neither is left over.
    expect(
      codes(`<section @change=@outer(day)>
        <div @click=@inner(day)>
          @foreach (const day of days) key (day.id) { <b delegate:day></b> }
        </div>
      </section>`),
    ).toEqual([]);
  });
});

describe('delegation — the pairing (§6.5, §6.7)', () => {
  it('a name with no marker under it is an ordinary argument, not a read', () => {
    expect(
      codes(`<div @click="@fn($event, day)">
        @foreach (const day of days) key (day.id) { <b>@day.n</b> }
      </div>`),
    ).toEqual([]);
  });

  it('FUD0664: two loops offering the same name to the same handler', () => {
    const inner = `<div @click="@fn(item)">
      @foreach (const item of a) key (item.id) { <b delegate:item></b> }
      @foreach (const item of b) key (item.id) { <i delegate:item></i> }
    </div>`;
    expect(codes(inner)).toEqual(['FUD0664']);
    expect(blamed(inner)).toBe('delegate:item');
  });

  it('FUD0664: it is an error even when both loops iterate the same list', () => {
    expect(
      codes(`<div @click="@fn(item)">
        @foreach (const item of rows) key (item.id) { <b delegate:item></b> }
        @foreach (const item of rows) key (item.id) { <i delegate:item></i> }
      </div>`),
    ).toEqual(['FUD0664']);
  });

  it('two loops under DIFFERENT handlers are two delegations and neither is ambiguous', () => {
    expect(
      codes(`<section>
        <div @click="@one(item)">
          @foreach (const item of a) key (item.id) { <b delegate:item></b> }
        </div>
        <div @click="@two(item)">
          @foreach (const item of b) key (item.id) { <i delegate:item></i> }
        </div>
      </section>`),
    ).toEqual([]);
  });

  it('nested loops delegate two names to one handler', () => {
    expect(
      codes(`<div @click="@fn(row, tag)">
        @foreach (const row of rows) key (row.id) {
          @foreach (const tag of row.tags) key (tag.id) { <b delegate:row delegate:tag></b> }
        }
      </div>`),
    ).toEqual([]);
  });
});

describe('delegation — a name that clashes (FUD1382, criterion 42)', () => {
  const PICK = `<div @click=@pick(day)>
    @foreach (const day of days) key (day.id) { <b delegate:day></b> }
  </div>`;

  it('a name of the @code is no clash: the loop binding is the row the handler reads (SDD-62)', () => {
    // The handler sits in the loop's scope for the delegated read, and there the binding shadows
    // the module's name: nothing is ambiguous, so FUD1382 is not said.
    expect(codes(PICK, '  const day = 1;\n  const days = [];\n  function pick(d) {}')).toEqual([]);
  });

  it('nor is an import of the @code', () => {
    expect(codes(PICK, "  import { day } from './x';")).toEqual([]);
  });

  it('a loop around the handler that declares the name clashes: FUD1382, on the mention', () => {
    const inner = `@foreach (const day of weeks) key (day.id) {
      <div @click=@pick(day)>
        @foreach (const day of day.days) key (day.id) { <b delegate:day></b> }
      </div>
    }`;
    expect(codes(inner)).toEqual(['FUD1382']);
    expect(blamed(inner)).toBe('day');
    expect(report(inner)[0]?.message).toBe(
      '`day` is both the delegated row and a name in scope here: rename the loop binding or the variable',
    );
  });

  it('a name of the @code that is not the row is no clash', () => {
    expect(codes(PICK, '  const other = 1;')).toEqual([]);
  });
});

describe('delegation — the event and the read (§6.8, §6.9)', () => {
  it('FUD0665: an event that does not bubble can never be delegated', () => {
    const inner = `<div @mouseenter="@fn($event, day)">
      @foreach (const day of days) key (day.id) { <b delegate:day></b> }
    </div>`;
    expect(codes(inner)).toEqual(['FUD0665']);
    expect(report(inner)[0]?.message).toContain('mouseover');
    expect(blamed(inner)).toBe('mouseenter');
  });

  it('FUD0665: with no substitute, the message offers none', () => {
    const inner = `<div @scroll="@fn(day)">
      @foreach (const day of days) key (day.id) { <b delegate:day></b> }
    </div>`;
    expect(codes(inner)).toEqual(['FUD0665']);
    expect(report(inner)[0]?.message).not.toContain('use `@');
  });

  it('the same event with no row read is an ordinary listener and stays legal', () => {
    expect(codes('<div @mouseenter="@fn($event)"></div>')).toEqual([]);
  });

  it('FUD0666: `$name` in a `class:` value and in text', () => {
    expect(codes('<b class:on="@$day"></b>')).toEqual(['FUD0666']);
    expect(codes('<b>@$day</b>')).toEqual(['FUD0666']);
    expect(blamed('<b class:on="@$day"></b>')).toBe('$day');
  });

  it('FUD1383: `$name` in a handler is the retired spelling, with the fix (criterion 43)', () => {
    const inner = `<div @click=@pick($day)>
      @foreach (const day of days) key (day.id) { <b delegate:day></b> }
    </div>`;
    // The marker is read by the retired spelling, and that is FUD1383's fact alone: not also a
    // dead marker (FUD0661) on the same mistake (SDD-62).
    expect(codes(inner)).toEqual(['FUD1383']);
    expect(blamed(inner)).toBe('$day');
    expect(report(inner)[0]?.message).toBe('a delegated row is read by its name: write `day`, not `$day`');
  });

  it('nor is a listed event read by `$name` FUD1381: the handler of that event reads it, retired', () => {
    const inner = `<div @input=@pick($day)>
      @foreach (const day of days) key (day.id) { <b delegate:day="input"></b> }
    </div>`;
    expect(codes(inner)).toEqual(['FUD1383']);
  });

  it('a marker no handler reads at all, by either spelling, is still FUD0661', () => {
    const inner = `<div @click=@pick(other)>
      @foreach (const day of days) key (day.id) { <b delegate:day></b> }
    </div>`;
    expect(codes(inner)).toEqual(['FUD0661']);
  });

  it('FUD1383 inside a lambda handler and through a hole in an array argument too', () => {
    expect(codes('<div @click="@(() => fn($day))"></div>')).toEqual(['FUD1383']);
    expect(codes('<div @click="@fn([$day, , 1])"></div>')).toEqual(['FUD1383']);
  });

  it('a `$name` that is a member or a key names somebody else\'s namespace', () => {
    expect(codes('<b>@row.$day</b>')).toEqual([]);
    expect(codes('<div @click="@fn({ $day: 1 })"></div>')).toEqual([]);
    expect(codes('<b>@row[$day]</b>')).toEqual(['FUD0666']);
  });

  it('leaves the runtime pieces a locale writes alone: `$message`, `$href` (SDD-58)', () => {
    // A pipe writes none since SDD-71: `$format` is an author's name like any other.
    expect(codes('<b>@($format(euros, precio, "en"))</b>')).toEqual(['FUD0666']);
    expect(codes('<b>@($message(parts, {}, "en"))</b>')).toEqual([]);
    expect(codes('<a href=@($href(url, "en", ["es", "en"]))>x</a>')).toEqual([]);
  });

  it('leaves a bare `$` alone: it is a name, not a prefix', () => {
    expect(codes('<div @click="@fn($)"></div>')).toEqual([]);
  });

  it('collects the reads of TWO handlers on the same element', () => {
    expect(
      codes(`<div @click="@one(day)" @keydown="@two(day)">
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

describe('delegation — the marker with a wrong value (§6.4, criterion 38)', () => {
  it('FUD0667 reaches the editor too, and the marker still serves every event', () => {
    const inner = `<div @click="@fn(day)">
      @foreach (const day of days) key (day.id) { <b delegate:day=@x></b> }
    </div>`;
    expect(withBindings(inner)).toEqual(['FUD0667']);
    // The delegation rule itself is silent about it: one fact, one voice.
    expect(codes(inner)).toEqual([]);
  });

  it('and an empty text the same; a literal event list does not', () => {
    expect(
      withBindings(`<div @click="@fn(day)">
        @foreach (const day of days) key (day.id) { <b delegate:day=""></b> }
      </div>`),
    ).toEqual(['FUD0667']);
    expect(
      withBindings(`<div @click="@fn(day)">
        @foreach (const day of days) key (day.id) { <b delegate:day="click"></b> }
      </div>`),
    ).toEqual([]);
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
      codes(`<div @click="@fn(row)">
        @foreach (const row of rows) key (row.id) {
          @foreach (const cell of row.cells) key (cell.id) { <b delegate:row></b> }
        }
      </div>`),
    ).toEqual([]);
  });

  it('offers the names of EVERY enclosing loop when the marker names none of them', () => {
    const inner = `<div @click="@fn(x)">
      @foreach (const row of rows) key (row.id) {
        @foreach (const cell of row.cells) key (cell.id) { <b delegate:x></b> }
      }
    </div>`;
    const message = report(inner)[0]?.message ?? '';
    expect(message).toContain('`row`');
    expect(message).toContain('`cell`');
  });
});

describe('eventsReadingRow — what a marker\'s value may list (criterion 46)', () => {
  /** The events above the element that starts at the first `<needle`, reading `name`. */
  function eventsAt(inner: string, needle: string, name: string): readonly string[] {
    const source = component(inner);
    const input = inputFor(source);
    const astOf = (node: Node) => {
      const id = input.fragmentId(node);
      return id === undefined ? undefined : (input.js.ast(id) as OxcNode);
    };
    const start = source.indexOf(needle);
    return eventsReadingRow(
      source,
      documentRoots(input.document),
      { headerAst: astOf, valueAst: astOf, spanOf: (n) => input.js.mapSpan(n.start, n.end), scope: new Set() },
      { start, end: start + needle.length },
      name,
    );
  }

  it('the events of every handler above that reads the row, each once, at any height', () => {
    expect(eventsAt(TABLE.replace('<tbody', '<tbody @keydown=@k(p)'), '<input', 'p')).toEqual(['keydown', 'change', 'click']);
    expect(
      eventsAt(`<section @click=@a(p)><ul @click=@b(p)>
        @foreach (const p of ps) key (p.id) { <li delegate:p></li> }
      </ul></section>`, '<li', 'p'),
    ).toEqual(['click']);
  });

  it('a handler that does not read the name, or a call that is no handler call, offers nothing', () => {
    expect(eventsAt(TABLE, '<input', 'q')).toEqual([]);
    expect(
      eventsAt(`<ul @click=@b>
        @foreach (const p of ps) key (p.id) { <li delegate:p></li> }
      </ul>`, '<li', 'p'),
    ).toEqual([]);
  });

  it('an element with no ancestor element, or one that is not there, offers nothing', () => {
    expect(eventsAt('<b delegate:p></b>', '<b', 'p')).toEqual([]);
    expect(eventsAt(TABLE, 'nowhere', 'p')).toEqual([]);
  });
});

describe('delegation — every code, out of the AST and out of the checker (§6.10)', () => {
  /** One document that breaks every pairing rule plus the one the classification owns. */
  const BROKEN = `<div delegate:loose></div>
<div @click="@a($ghost)"></div>
<div @mouseenter="@b(day)">
  @foreach (const day of days) key (day.id) { <i delegate:day></i> }
</div>
<div @click="@c(item)">
  @foreach (const item of a) key (item.id) { <b delegate:item></b> }
  @foreach (const item of b) key (item.id) { <u delegate:item=@one></u> }
</div>
@foreach (const dead of xs) key (dead.id) { <s delegate:dead></s> }
<div @click="@d(dia)">
  @foreach (const day of ys) key (day.id) { <em delegate:dia></em> }
</div>
<div @click="@e(q)">
  @foreach (const q of zs) key (q.id) { <em delegate:q="input"></em> }
</div>
@foreach (const w of ws) key (w.id) {
  <div @click="@f(w)">
    @foreach (const w of w.ws) key (w.id) { <em delegate:w></em> }
  </div>
}
<b class:on="@$stray"></b>`;

  it('reports all eleven codes over one document', () => {
    expect(new Set(withBindings(BROKEN))).toEqual(
      new Set([
        'FUD0660',
        'FUD0661',
        'FUD0662',
        'FUD0663',
        'FUD0664',
        'FUD0665',
        'FUD0666',
        'FUD0667',
        'FUD1381',
        'FUD1382',
        'FUD1383',
      ]),
    );
  });

  it('and the compiler that produced them cannot reach TypeScript at all', async () => {
    // The strongest form the promise of §4.5 can take in a test: the package that decides
    // these codes declares no dependency a checker could arrive through. Its runtime
    // dependencies are the parser and three packages of plain data and functions (diagnostics,
    // the ICU subset and catalog of SDD-58, and the reader of fudic.json whose sheet-name
    // pattern SDD-79 shares), none of which reaches a checker either.
    const manifest: { dependencies: Record<string, string> } = (
      await import('../../package.json', { with: { type: 'json' } })
    ).default;
    expect(Object.keys(manifest.dependencies)).toEqual(['@fudic/config', '@fudic/diagnostics', '@fudic/i18n', 'oxc-parser']);
    const i18n: { dependencies: Record<string, string> } = (
      await import('../../../i18n/package.json', { with: { type: 'json' } })
    ).default;
    expect(Object.keys(i18n.dependencies)).toEqual(['@fudic/conventions', '@fudic/diagnostics']);
    const config: { dependencies: Record<string, string> } = (
      await import('../../../config/package.json', { with: { type: 'json' } })
    ).default;
    expect(Object.keys(config.dependencies)).toEqual(['@fudic/baseline', '@fudic/conventions', '@fudic/diagnostics']);
    // The Baseline data of SDD-83 is a generated table and a judge: no dependency at all.
    const baseline: Readonly<Record<string, unknown>> = (
      await import('../../../baseline/package.json', { with: { type: 'json' } })
    ).default;
    expect(baseline['dependencies']).toBeUndefined();
  });
});

/** The table of SDD-80 §1: three handlers, two of them named, on the `<tbody>`. */
const NAMED_TABLE = `<tbody @change=@activar(p, $value) @click.borrar=@borrar(p) @click.ver=@ver(p)>
  @foreach (const p of personas) key (p.id) {
    <tr>
      <td><input type="checkbox" delegate:p="change"></td>
      <td><button delegate:p="click.borrar">Borrar</button></td>
      <td><button delegate:p="click.ver">Ver</button></td>
    </tr>
  }
</tbody>`;

describe('$value (SDD-80 §3.5, criteria 20–23)', () => {
  it('in the arguments of a handler on a control: no diagnostic', () => {
    expect(codes('<input type="checkbox" @change=@f($value)>')).toEqual([]);
    expect(codes(NAMED_TABLE)).toEqual([]);
  });

  it('criterion 20: a <div>, a bus: and @fudic:result have no control — FUD1462 on $value', () => {
    expect(codes('<div @click=@f($value)></div>')).toEqual(['FUD1462']);
    expect(blamed('<div @click=@f($value)></div>')).toBe('$value');
    expect(report('<div @click=@f($value)></div>')[0]!.message).toContain('<div> has none');
    expect(report('<button bus:alta=@f($value)></button>')[0]!.message).toContain('bus:alta has none');
    expect(report('<button bus:(canal)=@f($value)></button>')[0]!.message).toContain('bus:(…) has none');
    expect(report('<form @fudic:result=@f($value)></form>')[0]!.message).toContain('@fudic:result has none');
    expect(codes('<input type="submit" @click=@f($value)>')).toEqual(['FUD1462']);
    expect(codes('<app-x @change=@f($value)></app-x>')).toEqual(['FUD1462']);
  });

  it('criterion 21: an <input> with a dynamic type is FUD1463', () => {
    expect(codes('<input type=@t @input=@f($value)>')).toEqual(['FUD1463']);
  });

  it('criterion 22: marks of two types serving one handler are FUD1464; listing the events, nothing', () => {
    const two = (list: string) => `<tbody @change=@f(p, $value)>
  @foreach (const p of personas) key (p.id) {
    <tr><td><input type="checkbox" delegate:p></td><td><input type="number" delegate:p${list}></td></tr>
  }
</tbody>`;
    expect(codes(two(''))).toEqual(['FUD1464']);
    expect(report(two(''))[0]!.message).toContain('(boolean, number | null)');
    expect(codes(`<tbody @change=@f(p, $value) @click=@g(p)>
  @foreach (const p of personas) key (p.id) {
    <tr><td><input type="checkbox" delegate:p></td><td><input type="number" delegate:p="click"></td></tr>
  }
</tbody>`)).toEqual([]);
  });

  it('a delegated handler served by a mark with no value, or with a dynamic type', () => {
    const served = (mark: string) => `<ul @click=@f(p, $value)>
  @foreach (const p of items) key (p) {
    <li>${mark}</li>
  }
</ul>`;
    expect(report(served('<button delegate:p>x</button>'))[0]!.message).toContain('<button> has none');
    expect(codes(served('<input type=@t delegate:p>'))).toEqual(['FUD1463']);
  });

  it('criterion 23: $foo is still FUD1383 in a handler; $value outside one is FUD0666', () => {
    expect(codes('<input @input=@f($foo)>')).toEqual(['FUD1383']);
    expect(codes('<p>@$value</p>')).toEqual(['FUD0666']);
    expect(codes('<p class:on=@$value></p>')).toEqual(['FUD0666']);
    // In a handler but not among the arguments of its call: the callee, a lambda.
    expect(codes('<input @input=@(() => f($value))>')).toEqual(['FUD0666']);
  });
});

describe('named handlers (SDD-80 §3.6, criteria 26–28)', () => {
  it('criterion 26: a named handler that reads no row is FUD1466 on its name', () => {
    expect(codes('<button @click.x=@f()>b</button>')).toEqual(['FUD1466']);
    expect(blamed('<button @click.x=@f()>b</button>')).toBe('@click.x');
    expect(codes('<button @click.x=@f>b</button>')).toEqual(['FUD1466']);
  });

  it('criterion 27: a mark that lists a name nobody has is FUD1381', () => {
    const inner = `<tbody @click.borrar=@borrar(p)>
  @foreach (const p of personas) key (p.id) {
    <tr><td><button delegate:p="click.borrar">B</button><button delegate:p="click.editar">E</button></td></tr>
  }
</tbody>`;
    expect(codes(inner)).toEqual(['FUD1381']);
    expect(report(inner)[0]!.message).toContain('@click.editar');
  });

  it('criterion 28: neither `delegate:p="click"` nor `delegate:p` is read by @click.borrar', () => {
    const listed = `<tbody @click.borrar=@borrar(p)>
  @foreach (const p of personas) key (p.id) {
    <tr><td><button delegate:p="click">B</button></td></tr>
  }
</tbody>`;
    // The mark serves a `click` nobody unnamed reads, and the handler is served by no mark.
    expect(codes(listed)).toEqual(['FUD1381', 'FUD0660']);
    const bare = listed.replace('delegate:p="click"', 'delegate:p');
    expect(codes(bare)).toEqual(['FUD0661', 'FUD0660']);
  });

  it('a named handler of an event that does not bubble is FUD0665, on the event', () => {
    const inner = `<ul @focus.x=@f(p)>
  @foreach (const p of items) key (p) {
    <li delegate:p="focus.x">x</li>
  }
</ul>`;
    expect(codes(inner)).toEqual(['FUD0665']);
    expect(report(inner)[0]!.message).toContain('`focus` does not bubble');
  });

  it('@click and @click.borrar live together on one element', () => {
    expect(codes(`<tbody @click=@ver(p) @click.borrar=@borrar(p)>
  @foreach (const p of personas) key (p.id) {
    <tr><td delegate:p="click"><button delegate:p="click.borrar">B</button></td></tr>
  }
</tbody>`)).toEqual([]);
  });

  it('the editor is offered the named events above a marker', () => {
    const source = component(NAMED_TABLE);
    const input = inputFor(source);
    const astOf = (node: Node) => {
      const id = input.fragmentId(node);
      return id === undefined ? undefined : (input.js.ast(id) as OxcNode);
    };
    const start = source.indexOf('<button');
    const events = eventsReadingRow(
      source,
      documentRoots(input.document),
      { headerAst: astOf, valueAst: astOf, spanOf: (n) => input.js.mapSpan(n.start, n.end), scope: new Set() },
      { start, end: start + 7 },
      'p',
    );
    expect(events).toEqual(['change', 'click.borrar', 'click.ver']);
  });
});

describe('handlerAt — what the editor says about one handler (SDD-80 §4.8)', () => {
  /** The facts of the handler written at the first `needle` of `inner`. */
  function factsAt(inner: string, needle: string) {
    const source = component(inner);
    const input = inputFor(source);
    const astOf = (node: Node) => {
      const id = input.fragmentId(node);
      return id === undefined ? undefined : (input.js.ast(id) as OxcNode);
    };
    const start = source.indexOf(needle);
    return handlerAt(
      source,
      documentRoots(input.document),
      { headerAst: astOf, valueAst: astOf, spanOf: (n) => input.js.mapSpan(n.start, n.end), scope: new Set() },
      { start, end: start + needle.length },
    );
  }

  it('a delegated handler that does not write `$value` yet: what it would read, and its marks', () => {
    const facts = factsAt(TABLE, '@change');
    expect(facts.value?.type).toBe('boolean');
    expect(facts.served).toEqual({ name: 'p', marks: 1 });
    // `@click` is served by a button: a row, and no value.
    expect(factsAt(TABLE, '@click')).toEqual({ served: { name: 'p', marks: 1 } });
  });

  it('a handler on its own element, with no marker anywhere', () => {
    expect(factsAt('<input type="range" @input=@f()>', '@input').value?.type).toBe('number');
    expect(factsAt('<div @click=@f()></div>', '@click')).toEqual({});
  });

  it('nothing for a handler that is no call, nor for one with no control to read', () => {
    expect(factsAt('<input @input=@f>', '@input')).toEqual({});
    expect(factsAt('<form @fudic:result=@f()></form>', '@fudic')).toEqual({});
    expect(factsAt('<input bus:alta=@f()>', 'bus:')).toEqual({});
  });
});
