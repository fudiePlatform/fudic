/**
 * The acceptance harness: project the corpus and run the real TypeScript checker over the
 * result, in memory.
 *
 * This is what makes the SDD's claim testable instead of aspirational. "The projection
 * yields the right error" only means something if `tsc` itself says so, under the strict
 * configuration the project actually uses.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { GLOBALS_DTS, GLOBALS_FILE_NAME } from '../src/globals.js';
import { emitVirtualFiles } from '../src/emit.js';
import type { FileRegistry, VirtualFile } from '../src/types.js';
import { linkHref, type StructuredDocument } from '@fudic/compiler';
import { parseFud } from './_support.js';

const FIXTURES = resolve(fileURLToPath(new URL('../fixtures', import.meta.url)));
/** Virtual root the in-memory program lives under. */
const ROOT = '/corpus';

/** One `.fud` of the corpus, with its source and parsed document. */
interface CorpusFile {
  /** Corpus-relative POSIX path, e.g. `blog/[slug].fud`. */
  readonly path: string;
  readonly source: string;
  readonly document: StructuredDocument;
  /** The tag this file defines, for a component. */
  readonly tag: string;
}

/** Load the corpus, applying `overrides` (a mutation of one file's source). */
export function loadCorpus(overrides: Readonly<Record<string, string>> = {}): readonly CorpusFile[] {
  return fudFiles(FIXTURES).map((absolute) => {
    const path = posix.join(...relative(FIXTURES, absolute).split(/[\\/]/));
    const source = overrides[path] ?? readFileSync(absolute, 'utf8');
    const document = parseFud(source);
    return { path, source, document, tag: document.type === 'component-document' ? document.name : '' };
  });
}

/** The registry of one file: its own `<link>`s resolved against the corpus. */
function registryFor(file: CorpusFile, corpus: readonly CorpusFile[]): FileRegistry {
  const byTag = new Map<string, string>();

  for (const link of file.document.links) {
    const href = linkHref(link);
    if (href === undefined) continue;
    const target = corpus.find((c) => c.path === posix.normalize(posix.join(posix.dirname(file.path), href)));
    if (target !== undefined) byTag.set(target.tag, href);
  }

  const layout =
    file.document.type === 'route-document' || file.document.type === 'layout-document'
      ? file.document.layoutHref
      : undefined;

  return {
    component: (tag) => byTag.get(tag),
    layout: () => (layout === undefined || layout === '' ? undefined : layout),
  };
}

/** Project every `.fud` of the corpus into its virtual files. */
export function projectCorpus(
  overrides: Readonly<Record<string, string>> = {},
): readonly { file: CorpusFile; virtuals: readonly VirtualFile[] }[] {
  const corpus = loadCorpus(overrides);
  return corpus.map((file) => ({
    file,
    virtuals: emitVirtualFiles({
      source: file.source,
      fileName: file.path,
      document: file.document,
      registry: registryFor(file, corpus),
    }),
  }));
}

/** A checker complaint, already mapped back to the `.fud` it came from. */
export interface CorpusDiagnostic {
  /** Corpus-relative path of the `.fud`. */
  readonly fud: string;
  /** The virtual file the checker reported in. */
  readonly virtual: string;
  readonly code: number;
  readonly message: string;
  /** Offset in the `.fud`, or `undefined` when the stretch does not report (scaffolding). */
  readonly sourceOffset: number | undefined;
  /** The source text under the diagnostic, when it maps. */
  readonly sourceText: string | undefined;
}

/**
 * Typecheck the projected corpus with the strict configuration of SDD-00, and map every
 * complaint back onto the `.fud`.
 */
export function typecheckCorpus(overrides: Readonly<Record<string, string>> = {}): readonly CorpusDiagnostic[] {
  const projected = projectCorpus(overrides);
  const files = new Map<string, string>();

  files.set(posix.join(ROOT, GLOBALS_FILE_NAME), GLOBALS_DTS);
  for (const tsFile of tsFixtures(FIXTURES)) {
    const path = posix.join(ROOT, ...relative(FIXTURES, tsFile).split(/[\\/]/));
    files.set(path, readFileSync(tsFile, 'utf8'));
  }
  for (const { virtuals } of projected) {
    for (const v of virtuals) {
      if (v.languageId === 'typescript') files.set(posix.join(ROOT, v.fileName), v.text);
    }
  }

  const program = ts.createProgram({
    rootNames: [...files.keys()],
    options: COMPILER_OPTIONS,
    host: hostFor(files),
  });

  const raw = [
    ...program.getSemanticDiagnostics(),
    ...program.getSyntacticDiagnostics(),
  ];

  return raw.flatMap((d) => {
    const virtualPath = d.file?.fileName ?? '';
    const virtualName = virtualPath.slice(ROOT.length + 1);
    const owner = projected.find(({ virtuals }) => virtuals.some((v) => v.fileName === virtualName));
    if (owner === undefined) return [];

    const virtual = owner.virtuals.find((v) => v.fileName === virtualName)!;
    const range = d.start === undefined ? undefined : mapBack(virtual, d.start, d.length ?? 0);

    return [
      {
        fud: owner.file.path,
        virtual: virtualName,
        code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
        sourceOffset: range?.start,
        sourceText:
          range === undefined
            ? undefined
            : owner.file.source.slice(range.start, range.start + range.length),
      },
    ];
  });
}

/**
 * A TypeScript language service over the projected corpus — what the real server drives.
 *
 * Rename and completion are answered by this object, not by the checker, so the criteria
 * about them (§6.10) can only be tested through it.
 */
export function languageServiceFor(overrides: Readonly<Record<string, string>> = {}): {
  readonly service: ts.LanguageService;
  readonly pathOf: (virtualName: string) => string;
  readonly projected: ReturnType<typeof projectCorpus>;
} {
  const projected = projectCorpus(overrides);
  const files = new Map<string, string>();

  files.set(posix.join(ROOT, GLOBALS_FILE_NAME), GLOBALS_DTS);
  for (const tsFile of tsFixtures(FIXTURES)) {
    files.set(
      posix.join(ROOT, ...relative(FIXTURES, tsFile).split(/[\\/]/)),
      readFileSync(tsFile, 'utf8'),
    );
  }
  for (const { virtuals } of projected) {
    for (const v of virtuals) {
      if (v.languageId === 'typescript') files.set(posix.join(ROOT, v.fileName), v.text);
    }
  }

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: () => '1',
    getScriptSnapshot: (fileName) => {
      const text =
        files.get(fileName) ??
        (fileName.includes('lib.') ? readFileSync(fileName, 'utf8') : undefined);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => ROOT,
    getCompilationSettings: () => COMPILER_OPTIONS,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (fileName) => files.has(fileName) || ts.sys.fileExists(fileName),
    readFile: (fileName) => files.get(fileName) ?? ts.sys.readFile(fileName),
    useCaseSensitiveFileNames: () => true,
    resolveModuleNameLiterals: (literals, containingFile) =>
      literals.map((literal) => {
        const candidate = posix.normalize(posix.join(posix.dirname(containingFile), literal.text));
        for (const suffix of ['.ts', '.d.ts', '']) {
          const resolvedFileName = `${candidate}${suffix}`;
          if (files.has(resolvedFileName)) {
            return { resolvedModule: { resolvedFileName, extension: ts.Extension.Ts } };
          }
        }
        return { resolvedModule: undefined };
      }),
  };

  return {
    service: ts.createLanguageService(host),
    pathOf: (virtualName) => posix.join(ROOT, virtualName),
    projected,
  };
}

/**
 * Map a diagnostic RANGE back to the source — the way the server will.
 *
 * Two details make the difference between a usable diagnostic and a puzzling one, and both
 * were found by these tests:
 *
 *  - The range, not just its start. `$section<$L0>('footer')` reports on `'footer'`
 *    including the quotes, which are scaffolding; the mapped stretch sits *inside* the
 *    reported range. Anchoring on the start alone drops the diagnostic entirely.
 *  - The length is clamped to the stretch. A tag projected as `$C_app_missing` is longer
 *    than the `app-missing` it stands for, so carrying the generated length over would
 *    underline text the diagnostic is not about.
 */
function mapBack(
  virtual: VirtualFile,
  generatedStart: number,
  generatedLength: number,
): { start: number; length: number } | undefined {
  const end = generatedStart + generatedLength;

  for (const m of virtual.mappings) {
    if (!m.caps.verification) continue;
    const mEnd = m.generatedOffset + m.length;
    if (mEnd <= generatedStart || m.generatedOffset >= end) continue;

    const from = Math.max(generatedStart, m.generatedOffset);
    const to = Math.min(end, mEnd);
    const into = from - m.generatedOffset;
    return {
      start: m.sourceOffset + Math.min(into, m.sourceLength),
      // Never longer than what the stretch actually stands for in the source.
      length: Math.max(Math.min(to - from, m.sourceLength - into), 0),
    };
  }
  return undefined;
}

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  isolatedModules: true,
  verbatimModuleSyntax: true,
  skipLibCheck: true,
  noEmit: true,
};

/**
 * A compiler host over the in-memory map, with hand-written module resolution.
 *
 * Resolving by hand rather than through `ts.resolveModuleName` keeps the test independent
 * of node resolution on disk: `'./app-badge.fud'` must find `app-badge.fud.ts` in the map,
 * and nothing else may be reachable.
 */
function hostFor(files: ReadonlyMap<string, string>): ts.CompilerHost {
  const libDir = posix.join(...dirname(ts.getDefaultLibFilePath({})).split(/[\\/]/));

  const read = (fileName: string): string | undefined =>
    files.get(fileName) ??
    (fileName.includes('lib.') ? readFileSync(fileName, 'utf8') : undefined);

  return {
    fileExists: (fileName) => files.has(fileName) || fileName.includes('lib.'),
    readFile: read,
    getSourceFile: (fileName, languageVersion) => {
      const text = read(fileName);
      return text === undefined
        ? undefined
        : ts.createSourceFile(fileName, text, languageVersion, true);
    },
    getDefaultLibFileName: () => posix.join(libDir, 'lib.es2023.full.d.ts'),
    writeFile: () => undefined,
    getCurrentDirectory: () => ROOT,
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    resolveModuleNameLiterals: (literals, containingFile) =>
      literals.map((literal) => {
        const candidate = posix.normalize(
          posix.join(posix.dirname(containingFile), literal.text),
        );
        for (const suffix of ['.ts', '.d.ts', '']) {
          const resolvedFileName = `${candidate}${suffix}`;
          if (files.has(resolvedFileName)) {
            return { resolvedModule: { resolvedFileName, extension: ts.Extension.Ts } };
          }
        }
        return { resolvedModule: undefined };
      }),
  };
}

function fudFiles(dir: string): readonly string[] {
  return walkDir(dir).filter((f) => f.endsWith('.fud'));
}

function tsFixtures(dir: string): readonly string[] {
  return walkDir(dir).filter((f) => f.endsWith('.ts'));
}

function walkDir(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walkDir(full) : [full];
  });
}
