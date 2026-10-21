/**
 * The physical layer of a `.fudapi`: each line cut into its indentation and tokens, and the
 * lines hung into a tree by their level.
 *
 * A token is a run of non-blank characters in which a `"…"` section may hold blanks. A `#`
 * that starts a token starts a comment to the end of the line; anywhere else, and inside
 * quotes, it is an ordinary character. A `pattern` declaration (a line read at level 0) is the
 * exception: after its name, the rest of the line is one token, `#` and quotes included. Inside quotes `\"` and `\\` are
 * escapes and any other backslash is itself. A string never crosses a line.
 *
 * Nothing here fails: an unclosed quote ends at the end of the line and a bad indentation is
 * read at the nearest valid level below, each reported once.
 */

import { FUD1060, FUD1061, FUD1066, span, type SourceDiagnostic, type Span } from '@fudic/diagnostics';

/** A quoted section inside a token, quotes included in `span`. */
export interface Quoted {
  readonly span: Span;
  /** The unescaped content. */
  readonly text: string;
  readonly closed: boolean;
}

export interface Token {
  readonly span: Span;
  /** The token exactly as written. */
  readonly raw: string;
  readonly quoted: readonly Quoted[];
}

/** One content line, placed in the tree. */
export interface LineNode {
  readonly tokens: readonly Token[];
  /** The level it is read at: 0 for a declaration. */
  readonly level: number;
  readonly children: readonly LineNode[];
  /** The `#` lines right above it, without the `#`. */
  readonly doc?: string;
  /** From its first token to its last, its own line only. */
  readonly span: Span;
}

/** Whether a token is one whole string, nothing glued to it. */
export function isString(t: Token): boolean {
  const q = t.quoted[0];
  return t.quoted.length === 1 && q!.span.start === t.span.start && q!.span.end === t.span.end;
}

/** The content of a string token, unescaped. */
export function stringText(t: Token): string {
  return t.quoted[0]!.text;
}

const isBlank = (c: string | undefined): boolean => c === ' ' || c === '\t';

export interface RawLine {
  readonly indent: number;
  readonly indentSpan: Span;
  readonly tabbed: boolean;
  readonly tokens: readonly Token[];
  readonly comment?: Span;
}

/** Cut `source[start, end)` — one line without its terminator — and report into `out`. */
export function readLine(source: string, start: number, end: number, out: SourceDiagnostic[]): RawLine {
  let i = start;
  let tabbed = false;
  while (i < end && isBlank(source[i])) {
    if (source[i] === '\t') tabbed = true;
    i++;
  }
  const indentSpan = span(start, i);

  const tokens: Token[] = [];
  let comment: Span | undefined;
  while (i < end) {
    if (isBlank(source[i])) {
      i++;
      continue;
    }
    // Any indentation under 2 is read at level 0, so a `pattern` there is a declaration.
    if (tokens.length === 2 && indentSpan.end - start < 2 && tokens[0]!.raw === 'pattern') {
      let last = end;
      while (isBlank(source[last - 1])) last--;
      tokens.push({ span: span(i, last), raw: source.slice(i, last), quoted: [] });
      break;
    }
    if (source[i] === '#') {
      comment = span(i, end);
      break;
    }
    const tokenStart = i;
    const quoted: Quoted[] = [];
    while (i < end && !isBlank(source[i])) {
      if (source[i] === '"') {
        const q = readQuoted(source, i, end);
        if (!q.closed) out.push(FUD1060({ span: q.span }));
        quoted.push(q);
        i = q.span.end;
      } else {
        i++;
      }
    }
    tokens.push({ span: span(tokenStart, i), raw: source.slice(tokenStart, i), quoted });
  }

  return {
    indent: indentSpan.end - indentSpan.start,
    indentSpan,
    tabbed,
    tokens,
    ...(comment !== undefined ? { comment } : {}),
  };
}

/** A quoted section starting at the `"` at `open`. */
function readQuoted(source: string, open: number, end: number): Quoted {
  let text = '';
  let i = open + 1;
  while (i < end) {
    const c = source[i] as string;
    if (c === '"') return { span: span(open, i + 1), text, closed: true };
    const next = source[i + 1];
    if (c === '\\' && (next === '"' || next === '\\')) {
      text += next;
      i += 2;
    } else {
      text += c;
      i++;
    }
  }
  return { span: span(open, end), text, closed: false };
}

/** `[start, end)` of every line, terminator excluded. `\n`, `\r\n` and `\r` all end a line. */
export function* lines(source: string): Generator<readonly [number, number]> {
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c !== '\n' && c !== '\r') continue;
    yield [start, i];
    if (c === '\r' && source[i + 1] === '\n') i++;
    start = i + 1;
  }
  yield [start, source.length];
}

/** A node while the tree is being built: its children still grow. */
interface Building {
  tokens: Token[];
  readonly level: number;
  readonly children: Building[];
  readonly doc?: string;
}

/**
 * The content lines of `source` hung by level. The roots are the level-0 lines; an indented
 * line with nothing above it to hang from is reported and dropped with all that hangs from it.
 *
 * A line indented deeper than the children of the line above and starting with a string is
 * not a line of its own: it continues the one above, whose last token it becomes.
 */
export function lineTree(source: string, out: SourceDiagnostic[]): readonly LineNode[] {
  const roots: Building[] = [];
  /** The last node placed at each level, the chain a new line can hang from. */
  const stack: Building[] = [];
  let doc: string[] = [];
  let previous: Building | undefined;
  /** The level of a dropped line: what hangs below it is dropped without a word. */
  let dropped = Infinity;

  for (const [start, end] of lines(source)) {
    const line = readLine(source, start, end, out);
    if (line.tokens.length === 0) {
      // A comment line feeds the documentation of the next line; a blank line cuts it.
      doc = line.comment !== undefined ? [...doc, docText(source, line.comment)] : [];
      continue;
    }

    const first = line.tokens[0]!;
    if (
      previous !== undefined &&
      !line.tabbed &&
      line.indent > (previous.level + 1) * 2 &&
      isString(first)
    ) {
      previous.tokens.push(...line.tokens);
      doc = [];
      continue;
    }

    let level = Math.floor(line.indent / 2);
    if (line.tabbed) out.push(FUD1061({ span: line.indentSpan, problem: 'tab' }));
    else if (line.indent % 2 !== 0) out.push(FUD1061({ span: line.indentSpan, problem: 'odd' }));

    const lineDoc = doc;
    doc = [];
    if (level === 0) {
      stack.length = 0;
      dropped = Infinity;
    } else if (stack.length === 0) {
      if (level <= dropped) {
        out.push(FUD1066({ span: span(first.span.start, line.tokens[line.tokens.length - 1]!.span.end) }));
        dropped = level;
      }
      previous = undefined;
      continue;
    } else if (level > stack.length) {
      if (!line.tabbed && line.indent % 2 === 0) out.push(FUD1061({ span: line.indentSpan, problem: 'jump' }));
      level = stack.length;
    }

    const node: Building = {
      tokens: [...line.tokens],
      level,
      children: [],
      ...(lineDoc.length > 0 ? { doc: lineDoc.join('\n') } : {}),
    };
    if (level === 0) roots.push(node);
    else stack[level - 1]!.children.push(node);
    stack.length = level;
    stack.push(node);
    previous = node;
  }

  return roots.map(freeze);
}

/** The text of a `# …` comment: without the `#` and one space after it. */
function docText(source: string, comment: Span): string {
  const text = source.slice(comment.start + 1, comment.end).trimEnd();
  return text.startsWith(' ') ? text.slice(1) : text;
}

function freeze(node: Building): LineNode {
  const first = node.tokens[0]!;
  const last = node.tokens[node.tokens.length - 1]!;
  return {
    tokens: node.tokens,
    level: node.level,
    children: node.children.map(freeze),
    ...(node.doc !== undefined ? { doc: node.doc } : {}),
    span: span(first.span.start, last.span.end),
  };
}
