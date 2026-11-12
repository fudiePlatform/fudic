/**
 * Real Chrome for the runtime's tests, and a fake `TermHost` over its page that records what the
 * runtime tells it and answers what each test sets of the criterion.
 */

import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Locator, type Page } from 'playwright-core';
import type { Box, Call, DocumentResponse, LastWhen, TermHost } from '../src/index.js';

export function launch(): Promise<Browser> {
  return chromium.launch({ channel: 'chrome', headless: true });
}

/** What a test sets of the criterion: the host answers it. */
export interface FakeRecord {
  url: string;
  calls: Call[];
  response: DocumentResponse | null;
  lastWhen: LastWhen;
  reloaded: boolean;
  paths: readonly string[] | null;
}

export interface FakeHost extends TermHost {
  /** Every `onLocate`, in order. */
  readonly located: { readonly ref: string; readonly box: Box }[];
  /** The `data-fud-src` each `onLocate` brought, in the same order: null when none. */
  readonly sources: (string | null)[];
  /** Every target `settle` received, in order. */
  readonly settled: Locator[];
  /** Every `quiet`, `clock` and `advance`, in order. */
  readonly told: string[];
  /** What the host answers of the criterion; a test changes it before the term runs. */
  readonly record: FakeRecord;
}

/** The folder a fake criterion's `.fudspec` lives in: where an `upload` finds its files. */
export const SPEC_DIR = fileURLToPath(new URL('./fixtures', import.meta.url)).replace(/\\/gu, '/');

/** A host whose `settle` records the target and runs the gesture, and whose `onLocate` accumulates. */
export function fakeHost(page: Page): FakeHost {
  const located: { ref: string; box: Box }[] = [];
  const settled: Locator[] = [];
  const sources: (string | null)[] = [];
  const told: string[] = [];
  const record: FakeRecord = { url: 'about:blank', calls: [], response: null, lastWhen: { requests: 0, downloads: [] }, reloaded: false, paths: null };
  return {
    page,
    located,
    sources,
    settled,
    told,
    record,
    get url() {
      return record.url;
    },
    resolve: (path) => `${SPEC_DIR}/${path.replace(/^\.\//u, '')}`,
    quiet: async () => void told.push('quiet'),
    clock: async (at, label) => void told.push(`clock ${at} ${label}`),
    advance: async (ms) => void told.push(`advance ${ms}`),
    calls: () => record.calls,
    response: () => record.response,
    lastWhen: () => record.lastWhen,
    reloaded: async () => record.reloaded,
    paths: async () => record.paths,
    settle: (target, gesture) => {
      settled.push(target);
      return gesture();
    },
    onLocate: (ref, box, source) => {
      located.push({ ref, box });
      sources.push(source);
    },
  };
}
