import { describe, expect, it } from 'vitest';
import { parseApi, type Decl } from '../src/index.js';
import { CANONICALS, HTTP, USER_FORM, USUARIOS, nodesOf, shape, slice, spansOf } from './helpers.js';

describe('spans (criterion 2)', () => {
  for (const [name, source] of Object.entries(CANONICALS)) {
    describe(name, () => {
      const { value } = parseApi(source);

      it('every name covers exactly its text', () => {
        for (const [path, node] of nodesOf(value)) {
          if (typeof node['text'] !== 'string') continue;
          const covered = slice(source, node.span);
          if (node['kind'] === 'string') expect(covered, path).toMatch(/^".*"$/su);
          else expect(covered, path).toBe(node['text']);
        }
      });

      it('every node holds the spans of what is inside it', () => {
        for (const [path, node] of nodesOf(value)) {
          for (const [inner, s] of spansOf(node)) {
            expect(s.start, `${path} ${inner}`).toBeGreaterThanOrEqual(node.span.start);
            expect(s.end, `${path} ${inner}`).toBeLessThanOrEqual(node.span.end);
          }
        }
      });

      it('every declaration starts with its keyword and ends with its last token', () => {
        for (const decl of value.declarations) {
          const text = slice(source, decl.span);
          expect(text).toBe(text.trim());
          expect(text.startsWith(slice(source, 'keyword' in decl ? decl.keyword : decl.verbSpan))).toBe(true);
        }
      });
    });
  }

  it('covers the exact text of the pieces of §1', () => {
    const decls = parseApi(USUARIOS).value.declarations;
    const [load, search, save, type] = decls as [
      Extract<Decl, { kind: 'load' }>,
      Extract<Decl, { kind: 'fn' }>,
      Extract<Decl, { kind: 'fn' }>,
      Extract<Decl, { kind: 'type' }>,
    ];
    expect(slice(USUARIOS, load.span)).toBe('load ssr\n  users  Person[]');
    expect(slice(USUARIOS, load.mode!.span)).toBe('ssr');
    expect(slice(USUARIOS, load.fields[0]!.span)).toBe('users  Person[]');
    expect(slice(USUARIOS, load.fields[0]!.type.span)).toBe('Person[]');
    expect(slice(USUARIOS, search.verbSpan)).toBe('get');
    expect(slice(USUARIOS, search.returns!.span)).toBe('-> Person[]');
    expect(slice(USUARIOS, search.returns!.arrow)).toBe('->');
    expect(slice(USUARIOS, save.uses[0]!.span)).toBe('use auth');
    expect(slice(USUARIOS, save.args[1]!.span)).toBe('active  bool');
    expect(slice(USUARIOS, type.span)).toBe('type Person\n  id      i32\n  name    str');
  });

  it('a `use` covers the parameter lines below it', () => {
    const chain = parseApi(HTTP).value.declarations[0] as Extract<Decl, { kind: 'chain' }>;
    expect(slice(HTTP, chain.uses[1]!.span)).toBe('use error-pages\n    routes  403 /entrar');
    expect(slice(HTTP, chain.uses[1]!.middlewares[0]!.args[0]!.span)).toBe('routes  403 /entrar');
    expect(slice(HTTP, chain.compress!.min!.span)).toBe('200');
  });

  it('a `require` covers its continuation line', () => {
    const form = parseApi(USER_FORM).value.declarations[0] as Extract<Decl, { kind: 'form' }>;
    const last = form.summary!.items[1]!;
    expect(slice(USER_FORM, last.span)).toBe(
      'require key-has-name  empty name or not acceso.clave contains name\n' +
        '                          "La contraseña no puede contener tu nombre."',
    );
  });
});

describe('line endings (criterion 3)', () => {
  for (const [name, source] of Object.entries(CANONICALS)) {
    it(`${name} reads the same with \\r\\n and \\r`, () => {
      const lf = parseApi(source);
      for (const eol of ['\r\n', '\r']) {
        const other = parseApi(source.replaceAll('\n', eol));
        expect(other.diagnostics).toEqual([]);
        expect(shape(other.value)).toEqual(shape(lf.value));
      }
    });
  }
});
