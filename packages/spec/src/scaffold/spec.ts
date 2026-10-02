/**
 * A new `.fudspec` (SDD-53 §4.1): the `component` line and the shape of a criterion, commented.
 *
 * No criterion is written: it would need a term, and a term the project lacks would make the
 * file red the moment it is born.
 */

/**
 * The text of a new `.fudspec`. With `props`, the commented `given` starts with `props base`,
 * for a component that needs a fixture; without, with a term like the other blocks.
 */
export function specSkeleton(tag: string, props: boolean): string {
  return (
    `component ${tag}\n` +
    '\n' +
    '# criterion <slug>\n' +
    '#   given\n' +
    (props ? '#     props base\n' : '#     <term> <args>\n') +
    '#   when\n' +
    '#     <term> <args>\n' +
    '#   then\n' +
    '#     <term> <args>\n'
  );
}
