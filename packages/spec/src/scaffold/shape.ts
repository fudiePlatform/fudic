/**
 * The type of a prop, described as data, and the sample value a new fixture gives it (SDD-53
 * §3.1, §4.3). This package depends on neither the compiler nor TypeScript, so the type arrives
 * already described: whoever holds a TypeScript program translates `$Props` into these shapes.
 *
 * A sample is the smallest value that compiles, never an invented one. What cannot be written
 * honestly — `any`, a function, a class instance, a cycle — has no sample, and the prop is left
 * out: the project check then says it is missing, and the developer decides what it holds.
 */

export type PropShape =
  | { readonly kind: 'string' | 'number' | 'boolean' | 'bigint' | 'null' }
  | { readonly kind: 'literal'; readonly value: string | number | boolean }
  | { readonly kind: 'array'; readonly element: PropShape }
  | { readonly kind: 'tuple'; readonly elements: readonly PropShape[] }
  | { readonly kind: 'object'; readonly props: readonly PropField[] }
  /** An index signature: `Record<string, T>`. */
  | { readonly kind: 'record' }
  | { readonly kind: 'union'; readonly members: readonly PropShape[] }
  /** `any` or `unknown`. */
  | { readonly kind: 'any' }
  /** A function, a class instance, a `Date`, a cycle: nothing a fixture can write. */
  | { readonly kind: 'opaque' };

export interface PropField {
  readonly name: string;
  readonly required: boolean;
  readonly shape: PropShape;
}

/** A string as a single-quoted TypeScript literal. */
export function quote(text: string): string {
  return `'${text.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'")}'`;
}

/** A property key: bare when it is an identifier, quoted otherwise. */
export function keyOf(name: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(name) ? name : quote(name);
}

/** The object of the required fields that have a sample; `{}` when none has. */
export function objectOf(props: readonly PropField[]): string {
  const fields = props.flatMap((field) => {
    const value = field.required ? sampleValue(field.shape) : undefined;
    return value === undefined ? [] : [`${keyOf(field.name)}: ${value}`];
  });
  return fields.length === 0 ? '{}' : `{ ${fields.join(', ')} }`;
}

/** A sample value for a shape, as TypeScript source; undefined when none can be written. */
export function sampleValue(shape: PropShape): string | undefined {
  switch (shape.kind) {
    case 'string':
      return "''";
    case 'number':
      return '0';
    case 'bigint':
      return '0n';
    case 'boolean':
      return 'false';
    case 'null':
      return 'null';
    case 'literal':
      return typeof shape.value === 'string' ? quote(shape.value) : String(shape.value);
    case 'array':
      return '[]';
    case 'tuple': {
      const values = shape.elements.map(sampleValue);
      return values.every((value) => value !== undefined) ? `[${values.join(', ')}]` : undefined;
    }
    case 'record':
      return '{}';
    case 'object':
      return objectOf(shape.props);
    case 'union':
      return unionValue(shape.members);
    case 'any':
    case 'opaque':
      return undefined;
  }
}

/** The first member that is not `null` and has a sample; `null` when only `null` is left. */
function unionValue(members: readonly PropShape[]): string | undefined {
  for (const member of members) {
    if (member.kind === 'null') continue;
    const value = sampleValue(member);
    if (value !== undefined) return value;
  }
  return members.some((member) => member.kind === 'null') ? 'null' : undefined;
}
