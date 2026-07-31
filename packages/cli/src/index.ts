/**
 * Entry point of `@fudic/cli` (SDD-22). The public surface is the plan API — every
 * command is `plan* → apply`, and the binary is a shell over it.
 */

export const VERSION = '0.0.1';

export type {
  BaseOptions,
  CliError,
  ComponentOptions,
  FileChange,
  FmtOptions,
  LayoutOptions,
  NewOptions,
  PackageManager,
  PageOptions,
  Plan,
  PlanCommand,
  PlanDiagnostic,
} from './types.js';

export { planFmt, filesOf } from './plans/fmt.js';
export { planNew } from './plans/new.js';
export { planComponent } from './plans/component.js';
export { planPage } from './plans/page.js';
export { planLayout } from './plans/layout.js';
export { apply } from './apply.js';
export { run, defaultDeps, type RunDeps, type Streams } from './run.js';

export { parseArgs, USAGE, type ParsedCommand, type GlobalFlags } from './args.js';
export { validateTag } from './tag.js';
export { routeToFile } from './route.js';
export { resolveLayout, LAYOUTS_DIR, type LayoutResolution } from './layout.js';
export { anchorFor, alreadyLinked, componentLinkTag, wireComponentLink } from './wire.js';
export { parseFud, staticAttr, type ParsedFud } from './parse.js';
export { renderTemplate, templatePath, TEMPLATES, type TemplateSpec, type TemplateRole } from './templates.js';
export { formatChange, formatDiagnostic, formatDiff, formatError, formatPlan, planToJson } from './report.js';
export {
  nodeReadIo,
  nodeWriteIo,
  nodeCommandRunner,
  walkFud,
  type ReadIo,
  type WriteIo,
  type CommandRunner,
} from './io.js';
export * from './diagnostics.js';
