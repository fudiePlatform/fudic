/**
 * The `.fudspec` of a project in its check: each one parsed and validated against the same
 * context the editor validates it with, so a criterion the editor marks red breaks the build too.
 *
 * Read again on every check, they are small and the check is not per keystroke: a term module
 * or a fixture that changed is seen without anyone having to say so.
 */

import type { SourceDiagnostic } from '@fudic/diagnostics';
import { parseSpec, specContextOf, validateSpec, type ComponentInfo, type SpecFs } from '@fudic/spec';
import type { ApiProjectFiles } from './api-project.js';
import { contractOf } from './contract.js';
import type { CheckFs } from './files.js';
import { parseFud } from './parse.js';
import { specReach } from './spec-reach.js';

/** What the parser and the validator say about one `.fudspec`. */
export interface SpecFileDiagnostics {
  readonly file: string;
  /** The text it was read from. */
  readonly source: string;
  readonly diagnostics: readonly SourceDiagnostic[];
}

/** The components a criterion can name: every `.fud` of the index with a tag. */
export interface ComponentList {
  all(): readonly { readonly path: string; readonly tag: string }[];
}

/** The component behind each `.fud`, kept while its text is the same. */
type Components = Map<string, { readonly source: string; readonly info: ComponentInfo | undefined }>;

/**
 * Every `.fudspec` under `root` with what it says, in path order, and every file the check read
 * to say it: what a dev server watches.
 */
export function specDiagnostics(
  root: string,
  fs: CheckFs,
  index: ComponentList,
  api: Pick<ApiProjectFiles, 'index' | 'byPath'>,
  components: Components = new Map(),
): { readonly files: readonly SpecFileDiagnostics[]; readonly read: readonly string[] } {
  if (fs.specFiles === undefined || fs.readDirectory === undefined) return { files: [], read: [] };
  const read = new Set<string>();
  const specFs: SpecFs = {
    readDirectory: fs.readDirectory.bind(fs),
    readFile: (path) => {
      const text = fs.readFile(path);
      if (text !== undefined) read.add(path);
      return text;
    },
  };
  // What a page or a flow can call, read off the project's `.fudapi` as the editor reads it (SDD-82 §8.2.9).
  const reach = specReach({ root, index: api.index, source: (path) => api.byPath.get(path), read: specFs.readFile });
  const context = specContextOf(root, { fs: specFs, component: (tag) => componentOf(tag, fs, index, components), ...reach });

  const files: SpecFileDiagnostics[] = [];
  for (const file of [...fs.specFiles(root)].sort()) {
    const text = specFs.readFile(file);
    if (text === undefined) continue;
    const parsed = parseSpec(text);
    const diagnostics = [...parsed.diagnostics, ...validateSpec(parsed.value, context)];
    // Every file, the clean ones too: a `fud-disable` there may have silenced nothing.
    files.push({ file, source: text, diagnostics });
  }
  return { files, read: [...read] };
}

/**
 * The component with that tag, with the props its contract requires: the editor's answer. A
 * file that is not a component — a page, a layout — is not one a criterion can name.
 */
function componentOf(tag: string, fs: CheckFs, index: ComponentList, components: Components): ComponentInfo | undefined {
  const entry = index.all().find((e) => e.tag === tag);
  if (entry === undefined) return undefined;
  const source = fs.readFile(entry.path) ?? '';
  const known = components.get(entry.path);
  if (known !== undefined && known.source === source) return known.info;
  const { document } = parseFud(source);
  const info: ComponentInfo | undefined =
    document.type === 'component-document'
      ? {
          tag,
          path: entry.path,
          requiredProps: contractOf(source, document)
            .props.filter((prop) => prop.required)
            .map((prop) => prop.name),
        }
      : undefined;
  components.set(entry.path, { source, info });
  return info;
}
