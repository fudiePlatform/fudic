/**
 * A component painted in the bench's browser for someone who wants to see it (SDD-78): one page
 * per case, mounted as a criterion's page is — same project start, same Vite, same browser —, and
 * from each its outline and a shot of the host. `fudic_render` with `engine: "browser"` paints one
 * case; `fudic_look` every case of the fixture.
 *
 * The values go into the page as literals, so they have to come back the same from JSON.
 */

import { firstLine, type BrowserChoice, type BrowserLike } from './browser.js';
import { writePlanFiles } from './bench-dir.js';
import { executeFixtures } from './execute-fixtures.js';
import { jsonLiteral } from './host.js';
import { caseShape, propAttrs } from './mount-source.js';
import { nodeTargetFs } from './open.js';
import { htmlOf } from './html.js';
import { outlineOf } from './outline.js';
import { mountFiles, pageSource } from './pages.js';
import { startProject } from './project.js';
import { resolveTarget, type BenchTarget } from './target.js';
import { isFailure, type WorkbenchFailure } from './types.js';

/** A case to paint: its name and its values, `$content` among them. */
export interface PaintCase {
  readonly name: string;
  readonly values: Readonly<Record<string, unknown>>;
}

export type PaintedCase =
  | { readonly name: string; readonly outline: string; readonly html: string; readonly png?: Buffer; readonly errors: readonly string[] }
  /** A value that does not come back the same from JSON: it cannot be written into the page. */
  | { readonly name: string; readonly notJson: string }
  /** The page did not open: it answered an error status. */
  | { readonly name: string; readonly error: string };

/** The page of one case, with each prop a literal of its `@code`. */
export function casePage(target: BenchTarget, id: string, values: Readonly<Record<string, unknown>>): { source: string } | { notJson: string } {
  const shape = caseShape(values);
  const consts: string[] = [];
  for (const prop of shape.order) {
    const literal = jsonLiteral(shape.props[prop]);
    if (literal === undefined) return { notJson: prop };
    consts.push(`      const ${prop} = ${literal};\n`);
  }
  const code = consts.length === 0 ? '' : `    @code {\n${consts.join('')}    }\n`;
  const attrs = propAttrs(shape.order, (prop) => prop);
  return { source: pageSource(target.tag, id, { href: target.component, tag: target.tag, code, attrs, content: shape.content }) };
}

export interface PaintInput {
  readonly target: BenchTarget;
  readonly cases: readonly PaintCase[];
  /** Narrows the outline: CSS, through shadow roots, inside the host. */
  readonly select?: string;
  /** Whether to photograph the host. */
  readonly shoot: boolean;
  readonly browser?: BrowserChoice;
}

/** Every case on its page, one after the other, in one start of the project. */
export async function paintCases(input: PaintInput): Promise<readonly PaintedCase[] | WorkbenchFailure> {
  const { target } = input;
  const project = await startProject({ root: target.projectRoot, targets: [target], options: input.browser !== undefined ? { browser: input.browser } : {} });
  if (isFailure(project)) return project;
  try {
    const files = new Map(mountFiles(target));
    const pages: { name: string; route?: string; notJson?: string }[] = [];
    for (const [index, one] of input.cases.entries()) {
      const id = `case-${index}`;
      const page = casePage(target, id, one.values);
      if ('notJson' in page) pages.push({ name: one.name, notJson: page.notJson });
      else {
        files.set(`routes/${target.tag}/${id}.fud`, page.source);
        pages.push({ name: one.name, route: `/${target.tag}/${id}` });
      }
    }
    writePlanFiles(project.dir, target.tag, files);
    const painted: PaintedCase[] = [];
    for (const one of pages) {
      if (one.route === undefined) painted.push({ name: one.name, notJson: one.notJson! });
      else painted.push(await paintOne(project.browser, project.server.origin, one.name, one.route, target.tag, input));
    }
    return painted;
  } finally {
    await project.close();
  }
}

async function paintOne(
  browser: BrowserLike,
  origin: string,
  name: string,
  route: string,
  tag: string,
  input: PaintInput,
): Promise<PaintedCase> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.onPageError((message) => errors.push(firstLine(message)));
  try {
    const status = await page.goto(origin + route);
    if (status === null || status >= 400) return { name, error: `the page answered ${status ?? 'nothing'}` };
    const host = `body > ${tag}`;
    const selector = input.select === undefined ? host : `${host} >> ${input.select}`;
    const outline = await outlineOf(page.page, selector);
    const html = await htmlOf(page.page, selector);
    if (!input.shoot) return { name, outline, html, errors };
    const box = await page.locate(host).box();
    const png = box === null || box.width === 0 || box.height === 0 ? undefined : await page.locate(host).screenshot();
    return { name, outline, html, ...(png !== undefined ? { png } : {}), errors };
  } finally {
    await page.close();
  }
}

/** A component's fixture, executed; empty without one, the cause when it threw. */
export async function casesOf(target: BenchTarget): Promise<{ readonly cases: Readonly<Record<string, Readonly<Record<string, unknown>>>> } | WorkbenchFailure> {
  if (target.fixture === null) return { cases: {} };
  const executed = await executeFixtures(target.projectRoot, [target.fixture]);
  const failed = executed.diagnostics[0];
  if (failed !== undefined) return { diagnostic: failed };
  return { cases: executed.fixtures.get(target.fixture)! };
}

export interface BrowserRenderInput {
  /** The component's `.fud`, absolute. */
  readonly component: string;
  readonly case?: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly select?: string;
  readonly browser?: BrowserChoice;
}

export type BrowserRender =
  | { readonly kind: 'rendered'; readonly outline: string; readonly html: string; readonly png?: Buffer; readonly errors: readonly string[] }
  | { readonly kind: 'no-case'; readonly cases: readonly string[] }
  | { readonly kind: 'not-json'; readonly prop: string }
  | { readonly kind: 'threw'; readonly message: string }
  | WorkbenchFailure;

/** One component, with a case of its fixture and props on top, in the bench's browser. */
export async function renderInBrowser(input: BrowserRenderInput): Promise<BrowserRender> {
  const target = resolveTarget(input.component, nodeTargetFs);
  if (isFailure(target)) return target;
  const fixture = await casesOf(target);
  if (isFailure(fixture)) return { kind: 'threw', message: fixture.diagnostic.message };
  if (input.case !== undefined && !(input.case in fixture.cases)) return { kind: 'no-case', cases: Object.keys(fixture.cases) };
  const values = { ...(input.case === undefined ? {} : fixture.cases[input.case]), ...input.props };
  const painted = await paintCases({
    target,
    cases: [{ name: input.case ?? 'props', values }],
    shoot: true,
    ...(input.select !== undefined ? { select: input.select } : {}),
    ...(input.browser !== undefined ? { browser: input.browser } : {}),
  });
  if (isFailure(painted)) return painted;
  const one = painted[0]!;
  if ('notJson' in one) return { kind: 'not-json', prop: one.notJson };
  if ('error' in one) return { kind: 'threw', message: one.error };
  return { kind: 'rendered', outline: one.outline, html: one.html, ...(one.png !== undefined ? { png: one.png } : {}), errors: one.errors };
}


export interface BrowserLookInput {
  /** The component's `.fud`, absolute. */
  readonly component: string;
  /** Only these cases; every case of the fixture without them. */
  readonly cases?: readonly string[];
  readonly browser?: BrowserChoice;
}

export type BrowserLook =
  /** `cases`: every case of the fixture, in its order; `painted`: those asked, with their shots. */
  | { readonly kind: 'looked'; readonly cases: readonly string[]; readonly painted: readonly PaintedCase[] }
  | { readonly kind: 'no-fixture' }
  | { readonly kind: 'no-cases' }
  | { readonly kind: 'no-case'; readonly name: string; readonly cases: readonly string[] }
  | { readonly kind: 'threw'; readonly message: string }
  | WorkbenchFailure;

/** Every case of a component's fixture, photographed in the bench's browser (SDD-78 §4.4). */
export async function lookInBrowser(input: BrowserLookInput): Promise<BrowserLook> {
  const target = resolveTarget(input.component, nodeTargetFs);
  if (isFailure(target)) return target;
  if (target.fixture === null) return { kind: 'no-fixture' };
  const fixture = await casesOf(target);
  if (isFailure(fixture)) return { kind: 'threw', message: fixture.diagnostic.message };
  const cases = Object.keys(fixture.cases);
  if (cases.length === 0) return { kind: 'no-cases' };
  const unknown = input.cases?.find((name) => !cases.includes(name));
  if (unknown !== undefined) return { kind: 'no-case', name: unknown, cases };
  const asked = input.cases ?? cases;
  const painted = await paintCases({
    target,
    cases: asked.map((name) => ({ name, values: fixture.cases[name]! })),
    shoot: true,
    ...(input.browser !== undefined ? { browser: input.browser } : {}),
  });
  if (isFailure(painted)) return painted;
  return { kind: 'looked', cases, painted };
}
