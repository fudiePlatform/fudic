import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1554`. */
export interface FUD1554Params extends FileInput {
  /** `lib`: the project is a library. `no-sw`: `sw.headers` in an app without `sw.json`. */
  readonly reason: 'lib' | 'no-sw';
}

/** A `.headers` file that applies to nothing (SDD-84). */
export const FUD1554 = (p: FUD1554Params): FileDiagnostic =>
  file(
    'FUD1554',
    'warning',
    p.reason === 'lib'
      ? 'a library is not served: its headers apply to nothing'
      : 'the app has no sw.json, so no Service Worker: sw.headers applies to nothing',
    p,
  );
