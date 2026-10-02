/**
 * Hover and go-to-definition in a `.fudspec` (SDD-52 §4.4). Both ask the same question — what
 * the cursor is on — and answer it differently: the hover says what it is, the definition
 * opens the file behind it.
 *
 * Three things have a file behind them: a term (its `.js`, the one that won across the layers),
 * the `component` tag (its `.fud`) and a `props` line (its key in the `.fixture.ts`).
 */

import type { Span } from '@fudic/diagnostics';
import { normalizeTerm, type ComponentInfo, type Fixtures, type Name, type TermModule } from '@fudic/spec';
import type { Hover, LocationLink, Range } from 'vscode-languageserver-protocol';
import { pathToUri } from '../uri.js';
import { rangeIn, signatureOf, spanRange, termLines, touches, type SpecDocument } from './document.js';
import type { SpecHost } from './host.js';

type Target =
  | { readonly kind: 'term'; readonly span: Span; readonly module: TermModule }
  | { readonly kind: 'component'; readonly span: Span; readonly component: ComponentInfo }
  | { readonly kind: 'fixture'; readonly span: Span; readonly fixtures: Fixtures; readonly name: Name };

const PROPS = 'props';

function targetAt(spec: SpecDocument, offset: number, host: SpecHost): Target | undefined {
  const tag = spec.file.component?.tag;
  if (tag !== undefined && touches(tag.span, offset)) {
    const component = host.component(tag.text);
    return component === undefined ? undefined : { kind: 'component', span: tag.span, component };
  }

  const placed = termLines(spec.file).find(({ term }) => touches(term.span, offset));
  if (placed === undefined) return undefined;
  const { block, term } = placed;

  if (term.name.text === PROPS) {
    const [arg] = term.args;
    if (arg === undefined || arg.kind === 'role' || tag === undefined) return undefined;
    const fixtures = host.fixtures(tag.text);
    const name = fixtures?.names.find((n) => n.text === arg.text);
    return fixtures === undefined || name === undefined ? undefined : { kind: 'fixture', span: term.span, fixtures, name };
  }

  if (!touches(term.name.span, offset)) return undefined;
  const module = host.terms(spec.path).resolve(block, normalizeTerm(term.name.text));
  return module === undefined ? undefined : { kind: 'term', span: term.name.span, module };
}

function markdownOf(target: Target): string {
  switch (target.kind) {
    case 'term': {
      const { module } = target;
      const describe = module.describe === undefined ? '' : `\n\n\`\`\`js\n${module.describe}\n\`\`\``;
      return `\`\`\`fudspec\n${signatureOf(module)}\n\`\`\`${describe}\n\n${module.layer} · \`${module.path}\``;
    }
    case 'component':
      return `\`<${target.component.tag}>\`\n\n\`${target.component.path}\``;
    case 'fixture':
      return `fixture \`${target.name.text}\`\n\n\`${target.fixtures.path}\``;
  }
}

export function specHover(spec: SpecDocument, offset: number, host: SpecHost): Hover | undefined {
  const target = targetAt(spec, offset, host);
  if (target === undefined) return undefined;
  return {
    contents: { kind: 'markdown', value: markdownOf(target) },
    range: spanRange(spec, target.span),
  };
}

const TOP: Range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

export function specDefinition(spec: SpecDocument, offset: number, host: SpecHost): LocationLink[] | undefined {
  const target = targetAt(spec, offset, host);
  if (target === undefined) return undefined;

  const read = (path: string): string | undefined => host.read(path);
  // A term and a component are whole files: they open at the top. A fixture opens at its key.
  const [path, range] =
    target.kind === 'term'
      ? [target.module.path, TOP]
      : target.kind === 'component'
        ? [target.component.path, TOP]
        : [target.fixtures.path, rangeIn(spec, target.fixtures.path, target.name.span, read)];

  return [
    {
      targetUri: pathToUri(path).toString(),
      targetRange: range,
      targetSelectionRange: range,
      originSelectionRange: spanRange(spec, target.span),
    },
  ];
}
