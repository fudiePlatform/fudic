/**
 * The files of a value, by their path (SDD-81 §3.3): what travels in a part of its own and what
 * stays in `$args` (or `$value`), in one walk for each direction.
 *
 * A path is the place of the file in the value, with dots: a field (`avatar`), an element of a
 * list (`fotos.0`), a field inside a `type` (`doc.adjunto`), an entry of a `map` by its position
 * (`anexos.2`). Both ends know the types, so nothing in `$args` marks where a file was: a `file`
 * slot is left out, a `file[]` is its parts `x.0`, `x.1`… in a row, and a `map` keeps its keys
 * with `null` where the file goes.
 */

import { fileOf } from '../contract/wire.js';
import type { Ty } from './ty.js';

/** A file and where it goes. */
export type FilePart = readonly [path: string, file: File];

const at = (path: string, step: string | number): string => (path === '' ? String(step) : `${path}.${step}`);

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** `file`, `file?`: one file in one part. */
const isFile = (ty: Ty): boolean => ty === 'file' || (typeof ty !== 'string' && 'opt' in ty && isFile(ty.opt));

/** Whether a value of `ty` can hold a file anywhere (SDD-81 §3.3): then its call is multipart. */
export function hasFiles(ty: Ty, seen: Set<unknown> = new Set()): boolean {
  if (ty === 'file') return true;
  if (typeof ty === 'string' || 'oneOf' in ty) return false;
  if ('opt' in ty) return hasFiles(ty.opt, seen);
  if ('list' in ty) return hasFiles(ty.list, seen);
  if ('map' in ty) return hasFiles(ty.map[1], seen);
  if (seen.has(ty.fields)) return false;
  seen.add(ty.fields);
  return Object.values(ty.fields()).some((field) => hasFiles(field, seen));
}

/** Whether any of `types` can hold a file. */
export const anyFiles = (types: Readonly<Record<string, Ty>>): boolean => Object.values(types).some((ty) => hasFiles(ty));

function split(ty: Ty, v: unknown, path: string, out: FilePart[]): unknown {
  if (isFile(ty)) {
    const file = fileOf(v);
    if (file !== undefined) out.push([path, file]);
    return undefined;
  }
  if (typeof ty === 'string' || 'oneOf' in ty || v === undefined || v === null) return v;
  if ('opt' in ty) return split(ty.opt, v, path, out);
  if ('list' in ty) {
    if (!Array.isArray(v)) return v;
    if (isFile(ty.list)) {
      v.forEach((x, i) => split(ty.list, x, at(path, i), out));
      return undefined;
    }
    return v.map((x, i) => split(ty.list, x, at(path, i), out));
  }
  if (!isRecord(v)) return v;
  if ('map' in ty) {
    return Object.fromEntries(
      Object.entries(v).map(([k, x], i) => [k, isFile(ty.map[1]) ? (split(ty.map[1], x, at(path, i), out), null) : split(ty.map[1], x, at(path, i), out)]),
    );
  }
  return fields(ty.fields(), v, path, out);
}

function fields(types: Readonly<Record<string, Ty>>, v: Readonly<Record<string, unknown>>, path: string, out: FilePart[]): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [name, x] of Object.entries(v)) {
    const ty = types[name];
    const kept = ty === undefined ? x : split(ty, x, at(path, name), out);
    if (kept !== undefined) rest[name] = kept;
  }
  return rest;
}

/** The arguments without their files, and the files with their paths. */
export function splitFiles(
  types: Readonly<Record<string, Ty>>,
  args: Readonly<Record<string, unknown>>,
): { readonly rest: Record<string, unknown>; readonly files: FilePart[] } {
  const files: FilePart[] = [];
  return { rest: fields(types, args, '', files), files };
}

/** A value without its files, and the files with their paths from the value itself. */
export function splitValue(ty: Ty, value: unknown): { readonly rest: unknown; readonly files: FilePart[] } {
  const files: FilePart[] = [];
  return { rest: split(ty, value, '', files), files };
}

function join(ty: Ty, v: unknown, path: string, parts: ReadonlyMap<string, File>): unknown {
  if (isFile(ty)) return parts.get(path);
  if (typeof ty === 'string' || 'oneOf' in ty) return v;
  if ('opt' in ty) return v === undefined || v === null ? v : join(ty.opt, v, path, parts);
  if ('list' in ty) {
    if (isFile(ty.list)) {
      const files: File[] = [];
      for (let file = parts.get(at(path, 0)); file !== undefined; file = parts.get(at(path, files.length))) files.push(file);
      return files;
    }
    return Array.isArray(v) ? v.map((x, i) => join(ty.list, x, at(path, i), parts)) : v;
  }
  if (!isRecord(v)) return v;
  if ('map' in ty) return Object.fromEntries(Object.entries(v).map(([k, x], i) => [k, join(ty.map[1], x, at(path, i), parts)]));
  return joinFields(ty.fields(), v, path, parts);
}

function joinFields(types: Readonly<Record<string, Ty>>, v: Readonly<Record<string, unknown>>, path: string, parts: ReadonlyMap<string, File>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...v };
  for (const [name, ty] of Object.entries(types)) {
    const x = join(ty, v[name], at(path, name), parts);
    if (x !== undefined) out[name] = x;
  }
  return out;
}

/** The arguments with each file put back in its place. */
export const joinFiles = (types: Readonly<Record<string, Ty>>, rest: Readonly<Record<string, unknown>>, parts: ReadonlyMap<string, File>): Record<string, unknown> =>
  joinFields(types, rest, '', parts);

/** A value with each file put back in its place. */
export const joinValue = (ty: Ty, rest: unknown, parts: ReadonlyMap<string, File>): unknown => join(ty, rest, '', parts);

/**
 * Whether `path` is where a file of `types` can go: what the server checks a part's name
 * against before it reads a byte of it (SDD-81 §4.2). Without the value, a list or a map takes
 * any index, and the value decides later whether there was one.
 */
export function fileSlotAt(types: Readonly<Record<string, Ty>>, path: string): boolean {
  const [head, ...steps] = path.split('.');
  const ty = types[head!];
  return ty !== undefined && slotAt(ty, steps);
}

function slotAt(ty: Ty, steps: readonly string[]): boolean {
  if (steps.length === 0) return isFile(ty);
  if (typeof ty === 'string' || 'oneOf' in ty) return false;
  if ('opt' in ty) return slotAt(ty.opt, steps);
  const [step, ...rest] = steps as [string, ...string[]];
  const index = /^(?:0|[1-9]\d*)$/u.test(step);
  if ('list' in ty) return index && slotAt(ty.list, rest);
  if ('map' in ty) return index && slotAt(ty.map[1], rest);
  const field = ty.fields()[step];
  return field !== undefined && slotAt(field, rest);
}

/** The part a value that carries files opens with (SDD-81 §3.3): the rest of it, in its format. */
export const VALUE_PART = '$value';
