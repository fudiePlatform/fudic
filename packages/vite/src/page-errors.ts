/**
 * What a navigation answers when `load` or `layout` throws (SDD-56 §4.8): `@fudic/server`'s since
 * SDD-81, where every host that serves the app finds it. The prerender and the test harness read
 * it from here.
 */

export {
  backOf,
  classifyError,
  ERROR_PATTERN,
  minimalErrorPage,
  pageOriginOf,
  problemOfStatus,
  renderErrorPage,
  withoutBase,
  type PageError,
  type PageOrigin,
  type PageProblem,
} from '@fudic/server';
