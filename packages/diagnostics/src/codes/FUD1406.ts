import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** `fudic-mcp --tunnel` without `cloudflared` on the PATH (SDD-77). */
export const FUD1406 = (): ProjectDiagnostic =>
  project('FUD1406', 'warning', 'cloudflared is not installed: there is no public URL, the server goes on locally');
