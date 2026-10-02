/**
 * The props of a component as data (SDD-53 §3.3): `$Props` read with the checker and described
 * as `PropShape`s, so that `@fudic/spec` can write a fixture without holding TypeScript.
 *
 * The one translation of `ts.Type` into a shape. The CLI calls it through the project checker
 * and the language server over its own program; two translators would write two fixtures.
 *
 * The checker, never the text: `$Props` is `typeof $p0` and `$p0` is a `props<T>()` call, so
 * the members are reachable only by resolving that chain. The primitives are recognised by the
 * name the checker prints, as `propDetails` does, because the program may come from another
 * copy of TypeScript than this package's. Only `SymbolFlags` is read, whose values every 5.x
 * shares.
 *
 * What a fixture cannot write honestly is `opaque`: a function, a class instance, a type of
 * the standard library (`Date`, `Map`), a cycle, and anything below `MAX_DEPTH`.
 */

import defaultTypeScript from 'typescript';
import type * as ts from 'typescript';
import type { PropField, PropShape } from '@fudic/spec';

const PROPS_EXPORT = '$Props';

/** How deep a nested object, array or tuple is described; below it, `opaque`. */
const MAX_DEPTH = 4;

const OPAQUE: PropShape = { kind: 'opaque' };
const BOOLEAN: PropShape = { kind: 'boolean' };

/** Primitives by the name the checker prints. Anything not here is looked at structurally. */
const BY_NAME: Readonly<Record<string, PropShape>> = {
  string: { kind: 'string' },
  number: { kind: 'number' },
  boolean: BOOLEAN,
  bigint: { kind: 'bigint' },
  null: { kind: 'null' },
  true: { kind: 'literal', value: true },
  false: { kind: 'literal', value: false },
  any: { kind: 'any' },
  unknown: { kind: 'any' },
  undefined: OPAQUE,
  void: OPAQUE,
  never: OPAQUE,
  symbol: OPAQUE,
};

/** The props of the component in `file`, read from its `$Props` export; undefined when unreadable. */
export function propShapes(program: ts.Program, file: string): readonly PropField[] | undefined {
  const source = program.getSourceFile(file);
  if (source === undefined) return undefined;
  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(source);
  if (module === undefined) return undefined;
  const contract = checker.getExportsOfModule(module).find((it) => it.name === PROPS_EXPORT);
  if (contract === undefined) return undefined;
  return new ShapeReader(program, checker, source).fields(checker.getDeclaredTypeOfSymbol(contract), 0, new Set());
}

class ShapeReader {
  constructor(
    private readonly program: ts.Program,
    private readonly checker: ts.TypeChecker,
    private readonly source: ts.SourceFile,
  ) {}

  /** The properties of an object type, each with whether it can be left out. */
  fields(type: ts.Type, depth: number, path: ReadonlySet<ts.Type>): readonly PropField[] {
    return this.checker.getPropertiesOfType(type).map((prop) => ({
      name: prop.name,
      required: (prop.flags & defaultTypeScript.SymbolFlags.Optional) === 0,
      shape: this.shape(this.checker.getTypeOfSymbolAtLocation(prop, this.source), depth, path),
    }));
  }

  /** `path` holds the types being described above this one: meeting one again is a cycle. */
  shape(type: ts.Type, depth: number, path: ReadonlySet<ts.Type>): PropShape {
    if (type.isUnion()) return this.union(type, depth, path);
    if (type.isStringLiteral() || type.isNumberLiteral()) return { kind: 'literal', value: type.value };
    const named = BY_NAME[this.checker.typeToString(type)];
    if (named !== undefined) return named;

    if (depth >= MAX_DEPTH || path.has(type)) return OPAQUE;
    const below = new Set(path).add(type);
    // Before `isOpaque`: `Array` is an interface of the standard library too.
    if (this.checker.isTupleType(type) || this.checker.isArrayType(type)) {
      const elements = this.checker.getTypeArguments(type as ts.TypeReference).map((e) => this.shape(e, depth + 1, below));
      // An array type always has its one element type argument.
      return this.checker.isTupleType(type) ? { kind: 'tuple', elements } : { kind: 'array', element: elements[0]! };
    }
    if (this.isOpaque(type)) return OPAQUE;
    if (type.getProperties().length === 0 && this.checker.getIndexInfosOfType(type).length > 0) {
      return { kind: 'record' };
    }
    return { kind: 'object', props: this.fields(type, depth + 1, below) };
  }

  /**
   * A union without its `undefined`, which is what an optional prop adds. `true | false` is how
   * the checker spells `boolean`, so the pair goes back to one `boolean` where the first was.
   */
  private union(type: ts.UnionType, depth: number, path: ReadonlySet<ts.Type>): PropShape {
    const shapes = type.types
      .filter((member) => this.checker.typeToString(member) !== 'undefined')
      .map((member) => this.shape(member, depth, path));
    const isBool = (s: PropShape): boolean => s.kind === 'literal' && typeof s.value === 'boolean';
    const first = shapes.findIndex(isBool);
    const members =
      shapes.filter(isBool).length === 2
        ? shapes.flatMap((s, i) => (!isBool(s) ? [s] : i === first ? [BOOLEAN] : []))
        : shapes;
    return members.length === 1 ? members[0]! : { kind: 'union', members };
  }

  /** A function, a class instance, or an interface of the standard library: no literal for it. */
  private isOpaque(type: ts.Type): boolean {
    if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) return true;
    const symbol = type.getSymbol();
    if (symbol === undefined) return false;
    if ((symbol.flags & defaultTypeScript.SymbolFlags.Class) !== 0) return true;
    // An interface exists only by being declared, so its symbol always carries declarations.
    return (
      (symbol.flags & defaultTypeScript.SymbolFlags.Interface) !== 0 &&
      symbol.declarations!.some((d) => this.program.isSourceFileDefaultLibrary(d.getSourceFile()))
    );
  }
}
