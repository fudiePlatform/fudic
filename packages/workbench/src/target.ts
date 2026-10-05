/**
 * From the file the user had open to what the workbench opens: the component, its `.fudspec`,
 * its fixture and the project that serves them. Pure: the disk comes in through `TargetFs`.
 *
 * Paths come in absolute and go out absolute with forward slashes, which is how the generated
 * pages write them.
 */

import { FUD0970, FUD0971 } from '@fudic/diagnostics';
import { FIXTURE_EXTENSION, SPEC_EXTENSION } from '@fudic/spec';
import type { WorkbenchFailure } from './types.js';

export interface BenchTarget {
  readonly tag: string;
  /** Absolute. */
  readonly component: string;
  /** Absolute; null without a `.fudspec`. */
  readonly spec: string | null;
  /** Absolute; null without a `.fixture.ts`. */
  readonly fixture: string | null;
  /** The folder of the nearest `fudic.json`, or else of the nearest `package.json`. */
  readonly projectRoot: string;
}

/** The disk `resolveTarget` reads, injected so it can be checked without one. */
export interface TargetFs {
  /** The text of a file; undefined when it cannot be read. */
  readFile(path: string): string | undefined;
  exists(path: string): boolean;
}

const COMPONENT_EXTENSION = '.fud';

/** A custom element name: lowercase, starting with a letter, with a hyphen. */
const TAG = /^[a-z][a-z0-9]*-[a-z0-9-]*$/u;

export function resolveTarget(file: string, fs: TargetFs): BenchTarget | WorkbenchFailure {
  const opened = slashes(file);
  const notComponent = { diagnostic: FUD0970({ file: opened }) };

  let component: string;
  if (opened.endsWith(SPEC_EXTENSION)) component = opened.slice(0, -SPEC_EXTENSION.length) + COMPONENT_EXTENSION;
  else if (opened.endsWith(COMPONENT_EXTENSION)) component = opened;
  else return notComponent;

  const dir = dirOf(component);
  const tag = component.slice(component.lastIndexOf('/') + 1, -COMPONENT_EXTENSION.length);
  const source = fs.readFile(component);
  if (!TAG.test(tag) || source === undefined || !declaresTag(source, tag)) return notComponent;

  const projectRoot = nearest(dir, 'fudic.json', fs) ?? nearest(dir, 'package.json', fs);
  if (projectRoot === undefined) return { diagnostic: FUD0971({ file: component }) };

  const spec = join(dir, tag + SPEC_EXTENSION);
  const fixture = join(dir, tag + FIXTURE_EXTENSION);
  return {
    tag,
    component,
    spec: fs.exists(spec) ? spec : null,
    fixture: fs.exists(fixture) ? fixture : null,
    projectRoot,
  };
}

/** Its markup is its own tag wrapping a `<template shadowrootmode>`. */
function declaresTag(source: string, tag: string): boolean {
  return new RegExp(`<${tag}(?:\\s[^>]*)?>\\s*<template\\s[^>]*shadowrootmode`, 'u').test(source);
}

/** The first folder, from `dir` up, that holds `name`. */
function nearest(dir: string, name: string, fs: TargetFs): string | undefined {
  for (let at = dir; ; ) {
    if (fs.exists(join(at, name))) return at;
    const up = dirOf(at);
    if (up === at) return undefined;
    at = up;
  }
}

export function slashes(path: string): string {
  return path.replaceAll('\\', '/');
}

/** The parent folder; a root (`/`, `C:`) is its own parent. */
function dirOf(path: string): string {
  const cut = path.lastIndexOf('/');
  if (cut < 0) return path;
  return cut === 0 ? '/' : path.slice(0, cut);
}

function join(dir: string, name: string): string {
  return dir.endsWith('/') ? dir + name : `${dir}/${name}`;
}
