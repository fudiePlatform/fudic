import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** `page.ttl` differs from `data.ttl` under `cache: "persist"`; `file` is the page (SDD-20). */
export const FUD0396 = (p: FileInput): FileDiagnostic =>
  file('FUD0396', 'warning', 'page.ttl differs from data.ttl with cache:"persist"; the data TTL wins', p);
