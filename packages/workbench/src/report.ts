/**
 * What `fudic-workbench run` prints for a person: one block per component, one line per
 * criterion, and under a criterion that did not pass, the step that failed with what it expected
 * and what it got. The last line is the count. `--json` prints the protocol's messages instead.
 */

import type { FudDiagnostic } from '@fudic/diagnostics';
import type { BenchMessage, ResultMessage, SessionMessage, StepResult, WireDiagnostic } from './protocol.js';
import type { RunSummary } from './run.js';

/** Evidence longer than this is cut: a line of output is not where a page of text is read. */
const LONGEST = 160;

const MARK = { pass: '✓', fail: '✗', error: '!' } as const;

export class HumanReport {
  readonly #write: (line: string) => void;
  readonly #sessions = new Map<string, SessionMessage>();
  readonly #results = new Map<string, ResultMessage[]>();

  constructor(write: (line: string) => void) {
    this.#write = write;
  }

  message(message: BenchMessage): void {
    if (message.type === 'session') this.#sessions.set(message.tag, message);
    else if (message.type === 'result') this.#results.set(message.tag, [...(this.#results.get(message.tag) ?? []), message]);
  }

  diagnostic(diagnostic: FudDiagnostic): void {
    this.#write(`${diagnostic.severity} ${diagnostic.code} ${diagnostic.message}`);
  }

  /** A component's block, its criteria in `.fudspec` order. */
  done(tag: string): void {
    const session = this.#sessions.get(tag);
    if (session === undefined) return;
    this.#write(tag);
    for (const diagnostic of session.diagnostics) this.#write(`  ${wire(diagnostic)}`);
    const results = new Map((this.#results.get(tag) ?? []).map((r) => [r.id, r]));
    const width = Math.max(0, ...session.criteria.map((c) => c.id.length));
    for (const criterion of session.criteria) {
      const result = results.get(criterion.id);
      if (result === undefined) continue;
      const head = `  ${MARK[result.verdict]} ${criterion.id.padEnd(width)}  `;
      this.#write(result.error === undefined ? `${head}${result.ms} ms` : `${head}error: ${result.error}`);
      const failed = result.steps.findIndex(isBad);
      const step = result.steps[failed];
      if (step !== undefined) {
        this.#write(`      ${step.block} ${criterion.steps[failed]?.text ?? step.term}`);
        for (const line of evidence(step)) this.#write(`        ${line}`);
      }
      for (const pageError of result.pageErrors) this.#write(`      page error: ${pageError}`);
    }
  }

  summary(summary: RunSummary): void {
    const total = summary.pass + summary.fail + summary.error;
    const seconds = (summary.ms / 1000).toFixed(1);
    const parts = [`${total} criteria`, `${summary.pass} pass`, `${summary.fail} fail`, `${summary.error} error`, `${seconds} s`];
    if (summary.browser !== null) parts.push(summary.browser);
    this.#write(parts.join(' · '));
  }
}

/**
 * What the workbench prints when a person launched it at a terminal instead of a parent process:
 * where its shell is, that it keeps running, and a block per component each time a run ends. It
 * never ends by itself — it serves the shell and runs again on save — so it says how to stop it.
 */
export class BenchConsole {
  readonly #write: (line: string) => void;
  readonly #report: HumanReport;
  /** What each component is still running, by tag. */
  readonly #running = new Map<string, Set<string>>();

  constructor(write: (line: string) => void) {
    this.#write = write;
    this.#report = new HumanReport(write);
  }

  opened(tag: string, url: string, browser: string): void {
    this.#write(`${tag} workbench (${browser}): ${url}`);
    this.#write('Open it in a browser; saving a file runs the criteria again. Ctrl+C stops it.');
  }

  message(message: BenchMessage): void {
    this.#report.message(message);
    if (message.type === 'problem') {
      this.#write(`problem: ${message.message}`);
      return;
    }
    if (message.type === 'running') {
      this.#running.set(message.tag, new Set(message.ids));
      return;
    }
    if (message.type !== 'result' && message.type !== 'cancelled') return;
    const running = this.#running.get(message.tag);
    if (running === undefined) return;
    for (const id of message.type === 'result' ? [message.id] : message.ids) running.delete(id);
    if (running.size > 0) return;
    this.#running.delete(message.tag);
    this.#write('');
    this.#report.done(message.tag);
  }
}

/** A step that made the criterion fail or stop. */
function isBad(step: StepResult): boolean {
  return 'error' in step || (step.block === 'then' && !step.pass);
}

/** What a failed step has to say: its error, or what it expected against what it got. */
function evidence(step: StepResult): string[] {
  if ('error' in step) return [`error: ${step.error}`];
  const value = step.evidence;
  if (typeof value === 'object' && value !== null && 'expected' in value && 'actual' in value) {
    return [`expected  ${text(value.expected)}`, `actual    ${text(value.actual)}`];
  }
  return [`got  ${text(value)}`];
}

function text(value: unknown): string {
  // `JSON.stringify` answers undefined for undefined and for a function.
  const written = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  return written.length > LONGEST ? `${written.slice(0, LONGEST)}…` : written;
}

function wire(diagnostic: WireDiagnostic): string {
  const where = diagnostic.file === null ? '' : ` — ${diagnostic.file}${diagnostic.line === null ? '' : `:${diagnostic.line}:${diagnostic.column}`}`;
  return `${diagnostic.severity} ${diagnostic.code} ${diagnostic.message}${where}`;
}
