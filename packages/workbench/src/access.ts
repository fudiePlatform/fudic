/**
 * How a generated page reads one fixture of the data module (SDD-61 §3.5): `fixtures.minima` when
 * the name can be written after a dot, `fixtures["titulo-largo"]` when it cannot. The portable view
 * indexes an object with text only for a field no dot can name.
 */
export function fixtureOf(name: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(name) ? `fixtures.${name}` : `fixtures[${JSON.stringify(name)}]`;
}
