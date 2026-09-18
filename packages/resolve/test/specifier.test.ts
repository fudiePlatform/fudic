/**
 * What an `href` is, decided from the string alone (SDD-43 §4.3).
 *
 * This is the half of the answer no filesystem is needed for, and it is the half the three
 * hosts have to agree on: a string classified differently in the editor and in the build is
 * the same defect as two resolvers.
 */

import { describe, it, expect } from 'vitest';
import { hrefKind, packageNameOf, subpathOf } from '../src/specifier.js';

describe('hrefKind', () => {
  it('reads `./` and `../` as paths', () => {
    expect(hrefKind('./card.fud')).toBe('path');
    expect(hrefKind('../components/card.fud')).toBe('path');
    expect(hrefKind('../../libs/ui/src/card.fud')).toBe('path');
  });

  it('reads an absolute path as a path, with either separator', () => {
    expect(hrefKind('/components/card.fud')).toBe('path');
    expect(hrefKind('\\components\\card.fud')).toBe('path');
  });

  it('reads a Windows drive as a path and not as a scheme', () => {
    // One letter before the colon is a drive, never a protocol. Without this, `C:/x.fud`
    // would be classified as external and silently ignored on the platform this repo runs on.
    expect(hrefKind('C:/proyecto/card.fud')).toBe('path');
    expect(hrefKind('c:\\proyecto\\card.fud')).toBe('path');
  });

  it('reads a UNC share as a path, though it starts with two separators', () => {
    expect(hrefKind('\\\\servidor\\ui\\card.fud')).toBe('path');
  });

  it('reads a URL as external', () => {
    expect(hrefKind('https://cdn.example.com/card.fud')).toBe('external');
    expect(hrefKind('data:text/html,x')).toBe('external');
    expect(hrefKind('//cdn.example.com/card.fud')).toBe('external');
  });

  it('reads everything else as a package', () => {
    expect(hrefKind('@acme/ui/card.fud')).toBe('package');
    expect(hrefKind('ui-kit/card.fud')).toBe('package');
    expect(hrefKind('ui-kit')).toBe('package');
  });

  it('reads a bare sibling as a package, which is what an import does', () => {
    // `card.fud` next to the file is `./card.fud`. Written bare it names a package, and the
    // href completion only ever offers the explicit form for exactly this reason.
    expect(hrefKind('card.fud')).toBe('package');
  });
});

describe('packageNameOf', () => {
  it('takes two segments for a scoped name and one otherwise', () => {
    expect(packageNameOf('@acme/ui/card.fud')).toBe('@acme/ui');
    expect(packageNameOf('ui-kit/card.fud')).toBe('ui-kit');
  });

  it('answers the specifier itself when it is only the package', () => {
    expect(packageNameOf('@acme/ui')).toBe('@acme/ui');
    expect(packageNameOf('ui-kit')).toBe('ui-kit');
  });

  it('keeps every segment of a deep subpath out of the name', () => {
    expect(packageNameOf('@acme/ui/src/components/card.fud')).toBe('@acme/ui');
  });
});

describe('subpathOf', () => {
  it('spells the subpath the way `exports` does', () => {
    expect(subpathOf('@acme/ui/card.fud')).toBe('./card.fud');
    expect(subpathOf('ui-kit/card.fud')).toBe('./card.fud');
    expect(subpathOf('@acme/ui/src/card.fud')).toBe('./src/card.fud');
  });

  it('answers `.` for the package itself', () => {
    expect(subpathOf('@acme/ui')).toBe('.');
    expect(subpathOf('ui-kit')).toBe('.');
  });
});
