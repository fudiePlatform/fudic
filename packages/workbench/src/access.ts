/**
 * How a generated page reads one fixture of the data module (SDD-61 §3.5): `fixtures.minima` when
 * the name can be written after a dot, `fixtures["titulo-largo"]` when it cannot. The portable view
 * indexes an object with text only for a field no dot can name. `object` is the name the module is
 * imported as: `fixtures` in the workbench, `cases` in the showcase.
 */
export function fixtureOf(name: string, object = 'fixtures'): string {
  return /^[A-Za-z_$][\w$]*$/u.test(name) ? `${object}.${name}` : `${object}[${JSON.stringify(name)}]`;
}
