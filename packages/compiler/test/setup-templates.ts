/**
 * The names a chunk's templates call (SDD-85 §4.1), as globals of the test runtime, under the
 * `$` aliases the chunk imports them with: the two template tags, and `selectDefault`, which a
 * chunk that creates a `<select>` imports on the same line (decision 42).
 *
 * Every harness that evaluates an emitted chunk strips its `import` lines and hands in the
 * bindings it needs by hand. The templates are declared at the top of every chunk with a block,
 * so every one of those harnesses would need the same bindings; they are here once instead.
 * Declaring one parses nothing — the first clone does — so this costs a test that never creates.
 */

import { selectDefault, template, templateIn } from '@fudic/dom';

Object.assign(globalThis, { $template: template, $templateIn: templateIn, $selectDefault: selectDefault });
