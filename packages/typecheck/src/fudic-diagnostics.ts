/**
 * Every `FUD` diagnostic of one document, as the editor publishes it and the build reports it
 * (SDD-24 §4.4, SDD-35 §4.3).
 *
 * Parse, structure, Oxc syntax and the semantic pass of SDD-12 all report with a span over the
 * `.fud`, which is the coordinate system both want. Nothing is re-implemented and nothing is
 * translated: an error one of them reports and the other does not is the failure mode this
 * function exists to prevent.
 *
 * The semantic pass runs over the AST and the Oxc batch the projection already holds, so asking
 * for diagnostics costs no parse.
 */

import {
  analyze,
  checkRenderCalls,
  declaredPropsOf,
  documentRoots,
  propChannelDiagnostics,
  SnippetRegistry,
  type ComponentRegistry,
  type Diagnostic,
  type ResolveIo,
  type SemanticInput,
} from '@fudic/compiler';
import { holeDiagnostics } from './holes.js';
import { parseFud } from './parse.js';
import { serverLinksOf } from './links.js';
import { hrefDiagnostics } from './href.js';
import type { LinkIndex } from './link-index.js';
import type { ProjectedFud } from './project.js';
import { reservedDollarDiagnostics } from './reserved-dollar.js';

/**
 * What the semantic pass may ask about another component: whether the tag is declared, and
 * nothing else.
 *
 * `propsOf` is deliberately absent. The contract of a child — its props, required or not, and
 * its slots — is TypeScript's to check over the projection, with more to say than a fudic rule:
 * `<site-nav .currnt=>` is `TS2561`, which knows the name was meant to be `current`. The three
 * fudic rules that used to say it too (`FUD0197`–`FUD0199`) were retired by SDD-35. One voice
 * per fact — the rule BUG-23 spent a month learning.
 */
function registryOf(document: ProjectedFud): ComponentRegistry {
  return { has: (tag) => document.registry.component(tag) !== undefined };
}

/**
 * What the `.fudapi` the document links bring into its view (SDD-60 §3.14): nothing at all when
 * it links none — no `load`, so no `data` — and `undefined` when one of them could not be read:
 * the caller cannot know, and the view then keeps the rule of its role.
 */
function apisOf(document: ProjectedFud): SemanticInput['apis'] {
  const links = serverLinksOf(document.document).length;
  const servers = document.registry.servers();
  if (servers.length < links) return undefined;
  return {
    data: servers.some((s) => s.load),
    names: new Set(servers.flatMap((s) => s.names)),
    later: new Set(servers.flatMap((s) => (s.later ?? []).map((f) => f.name))),
  };
}

/**
 * What the semantic pass is handed for the document already parsed. With an `index` that reads
 * modules, the path of the file and its project's modules too: what the server cut follows into
 * a store (SDD-61 §4.1).
 */
export function semanticInput(document: ProjectedFud, index?: LinkIndex): SemanticInput {
  const apis = apisOf(document);
  return {
    source: document.source,
    document: document.document,
    js: document.js.result,
    fragmentId: (node) => document.js.fragmentId(node),
    components: registryOf(document),
    path: document.path,
    ...(apis === undefined ? {} : { apis }),
    ...(index?.module === undefined ? {} : { readModule: (specifier, importer) => index.module!(importer, specifier) }),
  };
}

/** The semantic pass over the document already parsed. */
export function semanticDiagnostics(document: ProjectedFud, index?: LinkIndex): readonly Diagnostic[] {
  return analyze(semanticInput(document, index)).diagnostics;
}

/**
 * Every `@render` of the document against the snippets in its scope: the check the build runs
 * before it expands, so the editor and the build say the same thing about a call. What the scope
 * says about its links is left out: that is the links' to say, once.
 */
function snippetDiagnostics(document: ProjectedFud, index: LinkIndex): readonly Diagnostic[] {
  const io: ResolveIo = {
    // The registry's contract is a read that throws: an import it cannot read is a missing one.
    read: (path) => {
      const text = index.read?.(path);
      if (text === undefined) throw new Error(`cannot read ${path}`);
      return text;
    },
    resolve: (from, href) => index.serverPath?.(from, href) ?? href,
  };
  const scope = new SnippetRegistry(io).scopeOf(document.path, document.source, document.document, []);
  const out: Diagnostic[] = [];
  checkRenderCalls(documentRoots(document.document), scope, document.path, out);
  // A call inside an imported snippet's body is that file's to report: the check and the editor
  // check it too, and said from here as well it would be said once per file that imports it.
  return out.filter((d) => d.file === undefined);
}

/**
 * The form of each prop crossing this document writes (`FUD0200`, `FUD0201`), against what each
 * child declares: the build's rule, so the fudic voice is the editor's and the check's as well
 * and not only TypeScript's. A child that cannot be read is not checked.
 */
function channelDiagnostics(document: ProjectedFud, index: LinkIndex): readonly Diagnostic[] {
  const declared = new Map<string, ReturnType<typeof declaredPropsOf> | undefined>();
  const childProps = (tag: string): ReturnType<typeof declaredPropsOf> | undefined => {
    if (declared.has(tag)) return declared.get(tag);
    const href = document.registry.component(tag);
    const path = href === undefined ? undefined : index.serverPath?.(document.path, href);
    const text = path === undefined ? undefined : index.read?.(path);
    const child = text === undefined ? undefined : parseFud(text).document;
    const props = child?.type === 'component-document' ? declaredPropsOf(text!, child) : undefined;
    declared.set(tag, props);
    return props;
  };
  return propChannelDiagnostics(document.source, document.document, childProps);
}

/**
 * Every `FUD` diagnostic of one document: the compiler's, plus the rules no other layer can
 * see — an `href` that resolves to nothing, a route against its layout's holes, the reserved
 * `$`.
 *
 * The type errors are NOT here — they come from TypeScript over the projection, mapped back
 * by Volar.
 */
export function fudicDiagnostics(document: ProjectedFud, index: LinkIndex): readonly Diagnostic[] {
  return [
    ...document.diagnostics,
    ...semanticDiagnostics(document, index),
    ...snippetDiagnostics(document, index),
    ...channelDiagnostics(document, index),
    ...hrefDiagnostics(document, index),
    ...holeDiagnostics(document, index),
    ...reservedDollarDiagnostics(document),
  ];
}
