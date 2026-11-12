import type { SourceDiagnostic } from '@fudic/diagnostics';
import {
  createTermCatalog,
  parseSpec,
  validateSpec,
  type ComponentInfo,
  type Fixtures,
  type FunctionInfo,
  type PageInfo,
  type RouteFile,
  type SpecFs,
  type TermRoot,
} from '../src/index.js';

/**
 * A file system over a map of absolute paths; a path that maps to `undefined` cannot be read. A
 * folder lists its files and its subfolders, once each.
 */
export function memoryFs(files: Readonly<Record<string, string | undefined>>): SpecFs & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    readDirectory(path) {
      const prefix = `${path}/`;
      const names = Object.keys(files)
        .filter((f) => f.startsWith(prefix))
        .map((f) => f.slice(prefix.length).split('/')[0] as string);
      return [...new Set(names)];
    },
    readFile(path) {
      reads.push(path);
      return files[path];
    },
  };
}

export interface ParamSpec {
  readonly name: string;
  readonly type: string;
}

/** The source of a sound term module, with `run` and `selfTest`. */
export function termSource(name: string, block: string, params: readonly ParamSpec[] = []): string {
  const list = params.map((p) => `{ name: '${p.name}', type: '${p.type}' }`).join(', ');
  return [
    `export const meta = { name: '${name}', block: '${block}', params: [${list}] };`,
    'export async function run(ctx) {}',
    'export const selfTest = [];',
  ].join('\n');
}

export const WS = '/ws/fudic/terms';
export const FW = '/fw/terms';
export const ROOTS: readonly TermRoot[] = [
  { layer: 'workspace', path: WS },
  { layer: 'framework', path: FW },
];

export interface World {
  readonly files?: Readonly<Record<string, string | undefined>>;
  readonly components?: readonly ComponentInfo[];
  readonly fixtures?: readonly Fixtures[];
  readonly pages?: readonly PageInfo[];
  readonly routes?: readonly RouteFile[];
  readonly functions?: readonly FunctionInfo[] | 'unknown';
  /** The fixture of each flow, by name. */
  readonly flows?: Readonly<Record<string, Fixtures>>;
}

export const BUTTON: ComponentInfo = { tag: 'fud-button', path: '/ws/fud-button.fud', requiredProps: [] };

/** The validator's diagnostics for a `.fudspec` source, in a world made of term files. */
export function validate(source: string, world: World = {}): readonly SourceDiagnostic[] {
  const files = world.files ?? {};
  const terms = createTermCatalog(ROOTS, memoryFs(files));
  const components = world.components ?? [BUTTON];
  const fixtures = world.fixtures ?? [];
  return validateSpec(parseSpec(source).value, {
    terms,
    component: (tag) => components.find((c) => c.tag === tag),
    fixtures: (tag) => fixtures.find((f) => f.path === `/ws/${tag}.fixture.ts`),
    page: (route) => world.pages?.find((p) => p.route === route),
    flow: (name) => {
      const flow = world.flows?.[name];
      return { name, fixture: `/ws/src/flows/${name}.fixture.ts`, dir: '/ws/src/flows', ...(flow !== undefined ? { fixtures: flow } : {}) };
    },
    routes: () => world.routes ?? world.pages ?? [],
    functions: () => world.functions ?? 'unknown',
    exists: (path) => files[path] !== undefined,
  });
}
