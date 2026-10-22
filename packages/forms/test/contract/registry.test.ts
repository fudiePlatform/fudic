/**
 * SDD-60 §3.12, §4.4 and criterion 17 (the registry's half) — one implementation per piece,
 * in its folder, and the two errors naming the files.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { Slot, folderOf, loadingFile, resetRegistry, setFolders, takeRefusal } from '../../src/contract/index.js';

afterEach(() => {
  loadingFile(undefined);
  setFolders({ server: 'src/server', browser: 'src/browser' });
  resetRegistry();
});

const save = () => new Slot<() => number>('save of components/user-form', 'server');

describe('a slot', () => {
  it('holds what .handle registered, and nothing before', () => {
    const slot = save();
    expect(slot.get()).toBeUndefined();
    const fn = () => 1;
    loadingFile('server', 'src/server/a.ts');
    slot.set(fn);
    expect(slot.get()).toBe(fn);
  });

  it('two implementations name both files (§3.12)', () => {
    const slot = save();
    loadingFile('server', 'src/server/a.ts');
    slot.set(() => 1);
    loadingFile('server', 'src/server/b.ts');
    expect(() => slot.set(() => 2)).toThrow(
      'save of components/user-form is implemented twice: src/server/a.ts, src/server/b.ts',
    );
  });

  it('outside the folders, it is said so', () => {
    const slot = save();
    slot.set(() => 1);
    expect(() => slot.set(() => 2)).toThrow('is implemented twice: outside the folders, outside the folders');
  });

  it('a server piece in src/browser names the file and the right folder', () => {
    const slot = new Slot<() => boolean>('nif-unique of rules/nif', 'server');
    loadingFile('browser', 'src/browser/nif.ts');
    expect(() => slot.set(() => true)).toThrow('nif-unique of rules/nif must be implemented in src/server: src/browser/nif.ts');
    expect(slot.get()).toBeUndefined();
  });

  it('a client half in src/server is the wrong folder too', () => {
    const slot = new Slot<() => void>('the client half of auth of middlewares/auth', 'browser');
    loadingFile('server', 'src/server/auth.ts');
    expect(() => slot.set(() => undefined)).toThrow('must be implemented in src/browser: src/server/auth.ts');
  });

  it('the browser variant of a server piece refuses any implementation', () => {
    const slot = new Slot<() => void>('save of components/user-form', 'server', true);
    expect(() => slot.set(() => undefined)).toThrow('save of components/user-form must be implemented in src/server');
    loadingFile('server', 'src/server/a.ts');
    expect(() => slot.set(() => undefined)).toThrow('must be implemented in src/server: src/server/a.ts');
  });

  it('says what is missing, in the folder the project names', () => {
    const slot = save();
    expect(slot.missing()).toBe('save of components/user-form has no implementation in src/server');
    setFolders({ server: 'src/backend', browser: 'src/front' });
    expect(slot.missing()).toBe('save of components/user-form has no implementation in src/backend');
    expect(folderOf('server')).toBe('src/backend');
    expect(folderOf('browser')).toBe('src/front');
    loadingFile('browser', 'src/front/x.ts');
    expect(() => slot.set(() => 1)).toThrow('must be implemented in src/backend: src/front/x.ts');
  });
});

describe('a reload', () => {
  it('empties every slot, so the folders can load again', () => {
    const a = save();
    const b = new Slot<() => void>('auth', 'browser');
    a.set(() => 1);
    b.set(() => undefined);
    resetRegistry();
    expect(a.get()).toBeUndefined();
    expect(b.get()).toBeUndefined();
    a.set(() => 2);
    expect(a.get()!()).toBe(2);
  });
});

describe('takeRefusal', () => {
  it('answers the last refusal once, for the root to throw past a bundler of its own', () => {
    takeRefusal(); // what the tests above left
    expect(takeRefusal()).toBeUndefined();
    const slot = save();
    slot.set(() => 1);
    let thrown: unknown;
    try {
      slot.set(() => 2);
    } catch (error) {
      thrown = error;
    }
    expect(takeRefusal()).toBe(thrown);
    expect(takeRefusal()).toBeUndefined();
  });
});
