/**
 * `fudic g spec <component>` (SDD-53 §4.1): the criteria file of a component that exists, and
 * the fixture it needs when the component has required props.
 *
 * Nothing here writes a line of its own: the `.fudspec` and the fixture are what `@fudic/spec`
 * generates, which is also what the editor's light bulb creates, so the terminal and the editor
 * never disagree about what a new file looks like.
 *
 * The props are read with TypeScript, over the project's own program (`@fudic/typecheck`). That
 * is the one reader that knows what `Tone` or `Item[]` is; the reader is injected so the plan
 * can be checked without building a program, and loaded lazily so no other command pays for
 * TypeScript.
 */

import { tagOf } from '@fudic/config';
import { FUD0960 } from '@fudic/diagnostics';
import { FIXTURE_EXTENSION, SPEC_EXTENSION, fixtureModule, specSkeleton, type PropField } from '@fudic/spec';
import { dirname, joinPosix } from '../paths.js';
import { parseFud } from '../parse.js';
import { targetChange } from '../project.js';
import { resolveTarget, type Target } from '../workspace/target.js';
import { nodeReadIo, walkFiles, walkFud, type ReadIo } from '../io.js';
import type { CliError, FileChange, Plan, SpecOptions } from '../types.js';

/** The props of the component at `file` (absolute), in the project at `root`; undefined when unreadable. */
export type PropsReader = (root: string, file: string) => Promise<readonly PropField[] | undefined>;

/** The project's TypeScript program, built once for the one question. */
export const typeScriptProps: PropsReader = async (root, file) => {
  const { createProjectChecker } = await import('@fudic/typecheck');
  return createProjectChecker({ root }).propShapes(file);
};

/** The key of the first fixture a new file gets, and the one the skeleton names. */
export const BASE_FIXTURE = 'base';

/** Where the editor's fallback for `*.fud` imports goes when the project has none (SDD-52 §8.1). */
export const ENV_FILE = 'src/fudic-env.d.ts';

/** The declaration that keeps a fixture's `import type … from './x.fud'` out of the red in VS Code. */
export const ENV_DECLARATION =
  "// VS Code's own TypeScript server does not know what a `.fud` is, so a fixture that imports a\n" +
  "// component's props type would show the import in red. The fudic toolchain resolves the real\n" +
  '// `.fud` and wins over this fallback.\n' +
  "declare module '*.fud' {\n" +
  '  export type $Props = any;\n' +
  '}\n';

const DECLARES_FUD = /declare\s+module\s+['"]\*\.fud['"]/u;

export async function planSpec(
  name: string,
  opts: SpecOptions,
  io: ReadIo = nodeReadIo(),
  props: PropsReader = typeScriptProps,
): Promise<Plan> {
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return { changes: [], commands: [], diagnostics: [], errors: resolved.errors };
  const project = resolved.target;

  const tag = tagOf(project.config.prefix, name);
  const source = componentFile(project, tag, io);
  if (source === undefined) {
    return { changes: [], commands: [], diagnostics: [], errors: [FUD0960({ component: name })] };
  }

  const changes: FileChange[] = [];
  const errors: CliError[] = [];
  const dir = dirname(source);
  const fields = (await props(project.path, joinPosix(project.path, source))) ?? [];
  const needsFixture = fields.some((field) => field.required);

  const spec = targetChange(opts.cwd, joinPosix(project.dir, dir, `${tag}${SPEC_EXTENSION}`), specSkeleton(tag, needsFixture), opts.force, io);
  if (spec.error !== undefined) errors.push(spec.error);
  if (spec.change !== undefined) changes.push(spec.change);

  // An existing fixture already has its keys, and maybe the values someone chose: it is kept.
  const fixture = joinPosix(project.dir, dir, `${tag}${FIXTURE_EXTENSION}`);
  if (needsFixture && !io.exists(joinPosix(project.path, dir, `${tag}${FIXTURE_EXTENSION}`))) {
    changes.push({ kind: 'create', path: fixture, contents: fixtureModule(tag, [BASE_FIXTURE], fields) });
    if (!declaresFud(project, io)) {
      changes.push({ kind: 'create', path: joinPosix(project.dir, ENV_FILE), contents: ENV_DECLARATION });
    }
  }

  return { changes, commands: [], diagnostics: [], errors };
}

/** The `.fud` of the project whose host is `tag`, relative to the project; the identity is the host, not the file name. */
function componentFile(project: Target, tag: string, io: ReadIo): string | undefined {
  return walkFud(project.path, io).find((file) => {
    const doc = parseFud(io.read(joinPosix(project.path, file))).doc;
    return doc.type === 'component-document' && doc.name === tag;
  });
}

/** Whether a `.d.ts` under the project's `src/` already declares `*.fud`. */
function declaresFud(project: Target, io: ReadIo): boolean {
  const src = joinPosix(project.path, 'src');
  return walkFiles(src, io, '.d.ts').some((file) => DECLARES_FUD.test(io.read(joinPosix(src, file))));
}
