/**
 * Resolution of `initializationOptions` (SDD-24 §3.3).
 *
 * The input is whatever the client sent: `initialize` params are `unknown` by protocol, and
 * a server that trusts their shape dies on the first editor that spells `tsdk` wrong. Every
 * field is narrowed, and anything unusable falls back to its default — the degradation of
 * §6.1 is only reachable if a missing `tsdk` gets this far as an empty string instead of a
 * thrown `TypeError`.
 */

import type { FudicOptions } from './types.js';

/** Defaults of §3.3. Template diagnostics on; the virtuals dump off. */
export const DEFAULT_OPTIONS: FudicOptions = {
  tsdk: '',
  templateDiagnostics: true,
  exposeVirtualFiles: false,
};

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function string(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Narrow the client's `initializationOptions` into the options every module reads. */
export function resolveOptions(raw: unknown): FudicOptions {
  const root = record(raw);
  if (root === undefined) return DEFAULT_OPTIONS;

  const fudic = record(root['fudic']);
  return {
    tsdk: string(record(root['typescript'])?.['tsdk'], DEFAULT_OPTIONS.tsdk),
    templateDiagnostics: boolean(fudic?.['templateDiagnostics'], DEFAULT_OPTIONS.templateDiagnostics),
    exposeVirtualFiles: boolean(fudic?.['exposeVirtualFiles'], DEFAULT_OPTIONS.exposeVirtualFiles),
  };
}
