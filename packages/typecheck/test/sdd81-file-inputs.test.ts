/**
 * SDD-81 §3.7 — the fields of the forms a linked `.fudapi` gives, read by the host
 * (`FudIndex.server`), and the file inputs checked against them in every `FUD` diagnostic of a
 * document (`FUD1484`–`FUD1486`): what the editor and `fudic check` say, as the build does.
 */

import { describe, expect, it } from 'vitest';
import { fudicDiagnostics } from '../src/index.js';
import { describeFud, FudIndex } from '../src/fud-index.js';
import { indexOf, memoryFs, projected } from './_support.js';

const PATH = '/p/src/components/up-load.fud';

const FORMS: Readonly<Record<string, string>> = {
  '/p/src/components/up-load.fudapi': 'put save\n  form upForm\n',
  '/p/src/forms/up.fudapi': 'form upForm\n  avatar  file?\n    accept "image/png"\n  data  group\n    proof  file[]\n',
  '/p/src/forms/other.fudapi': 'form otherForm\n  x  str\n',
  '/p/src/forms/readme.md': '',
  // A folder named like a contract: listed, and nothing to read.
  '/p/src/odd.fudapi/x.txt': '',
  '/p/src/.cache/z.fudapi': 'form upForm\n  avatar  str\n',
  '/p/src/node_modules/x/y.fudapi': 'form upForm\n  avatar  str\n',
};

const component = (controls: string): string => `<link rel="server" href="./up-load.fudapi">
<up-load>
  <template shadowrootmode="open">
    <form control=@upForm form:=@save>
      ${controls}
    </form>
  </template>
</up-load>
`;

describe('FudIndex.server — the fields of the forms it gives', () => {
  it('a form a function takes by name, found in another file of the app, its groups walked', () => {
    const index = indexOf(FORMS);
    expect(index.server(PATH, './up-load.fudapi')?.fields).toEqual({
      upForm: { avatar: { type: 'file', accept: 'image/png' }, 'data.proof': { type: 'file[]' } },
    });
  });

  it('its own forms, without walking the others', () => {
    const index = indexOf({ ...FORMS, '/p/src/components/up-load.fudapi': 'put save\n  form upForm\n\nform upForm\n  a  file\n' });
    expect(index.server(PATH, './up-load.fudapi')?.fields).toEqual({ upForm: { a: { type: 'file' } } });
  });

  it('none when it gives no form, or the form is nowhere in the app', () => {
    expect(indexOf({ '/p/src/components/up-load.fudapi': 'get g\n  -> str\n' }).server(PATH, './up-load.fudapi')).not.toHaveProperty('fields');
    const missing = indexOf({ ...FORMS, '/p/src/components/up-load.fudapi': 'put save\n  form lost\n' });
    expect(missing.server(PATH, './up-load.fudapi')).not.toHaveProperty('fields');
  });

  it('stops walking once every form wanted is found', () => {
    const index = indexOf({ ...FORMS, '/p/src/zz/late.fudapi': 'form upForm\n  avatar  str\n' });
    expect(index.server(PATH, './up-load.fudapi')?.fields?.['upForm']?.['avatar']).toEqual({ type: 'file', accept: 'image/png' });
  });
});

describe('fudicDiagnostics — a file input against its field (criterion 29)', () => {
  const codes = (controls: string, files = FORMS): readonly string[] => {
    const { index, document } = projected(PATH, component(controls), files);
    return fudicDiagnostics(document, index).map((d) => d.code).filter((c) => /^FUD148[4-6]$/u.test(c));
  };

  it('FUD1484, FUD1485, FUD1486 as the build says them', () => {
    expect(codes('<input type="file" control=@upForm.avatar multiple>')).toEqual(['FUD1484']);
    expect(codes('<input type="file" control=@upForm.data.proof>')).toEqual(['FUD1485']);
    expect(codes('<input control=@upForm.avatar>')).toEqual(['FUD1486']);
  });

  it('nothing for a link whose forms are unknown', () => {
    expect(codes('<input type="file" control=@upForm.avatar multiple>', { '/p/src/components/up-load.fudapi': 'get g\n  -> str\n' })).toEqual([]);
  });
});

describe('a filesystem that cannot list its folders', () => {
  it('finds the forms of the file itself, and no other', () => {
    const { readDirectory: _, ...blind } = memoryFs(FORMS);
    const index = new FudIndex(blind, describeFud);
    index.scan('/p');
    expect(index.server(PATH, './up-load.fudapi')).not.toHaveProperty('fields');
  });
});

describe('several forms, in several files', () => {
  it('each from the file that declares it, past what else those files declare', () => {
    const index = indexOf({
      ...FORMS,
      '/p/src/components/up-load.fudapi': 'put save\n  form upForm\n\nput other\n  form otherForm\n',
      '/p/src/forms/up.fudapi': 'type T\n  x  str\n\nform spare\n  y  str\n\nform upForm\n  a  file\n',
    });
    expect(index.server(PATH, './up-load.fudapi')?.fields).toEqual({ upForm: { a: { type: 'file' } }, otherForm: { x: { type: 'str' } } });
  });
});
