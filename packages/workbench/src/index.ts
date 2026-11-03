export type { OpenedComponent, WorkbenchFailure, WorkbenchOptions, WorkbenchSession } from './types.js';
export type { BenchMessage, Command, ReportMessage, WireDiagnostic } from './protocol.js';
export { reportOf } from './report-of.js';
export type { BrokenRun, CriterionReport, FailedStep, ReportSession, ReportSource, SourceRef } from './report-of.js';
export type { BenchExtension, TermHost } from './extension.js';
export { isFailure } from './types.js';
export { openWorkbench } from './open.js';
export { runSpecs } from './run.js';
export type { RunOptions, RunSummary } from './run.js';
