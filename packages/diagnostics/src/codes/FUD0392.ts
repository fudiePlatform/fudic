import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0392`. */
export type FUD0392Params = FileInput &
  (
    | {
        /** `strategy().data.ttl` of a page; `file` is the page. */
        readonly where: 'strategy';
        /** The TTL as declared. */
        readonly ttl: unknown;
      }
    | {
        /** A resource rule of `sw.json`; `file` is that `sw.json`. */
        readonly where: 'resource';
        /** The resource name. */
        readonly name: string;
        /** The TTL as declared. */
        readonly ttl: unknown;
      }
  );

/** A TTL that is not `30s`/`5m`/`2h`/`7d` (SDD-20). */
export const FUD0392 = (p: FUD0392Params): FileDiagnostic =>
  file(
    'FUD0392',
    'warning',
    p.where === 'strategy'
      ? `strategy().data.ttl "${String(p.ttl)}" is invalid (expected 30s/5m/2h/7d)`
      : `${p.file}: resource "${p.name}" has an invalid ttl "${String(p.ttl)}" (expected 30s/5m/2h/7d)`,
    p,
  );
