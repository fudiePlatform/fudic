/**
 * A new `.fudspec` (SDD-53 §4.1): the `component` line and the shape of a criterion, commented.
 *
 * No criterion is written: it would need a term, and a term the project lacks would make the
 * file red the moment it is born.
 */

/**
 * The text of a new `.fudspec`. `props` adds the `props base` line to the commented criterion,
 * for a component that needs a fixture.
 */
export function specSkeleton(tag: string, props: boolean): string {
  return (
    `component ${tag}\n` +
    '\n' +
    '# criterion <slug>\n' +
    '#   given\n' +
    (props ? '#     props base\n' : '') +
    '#   when\n' +
    '#     <term> <args>\n' +
    '#   then\n' +
    '#     <term> <args>\n'
  );
}
