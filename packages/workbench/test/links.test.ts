import { describe, expect, it } from 'vitest';
import { componentFiles } from '../src/links.js';

/** A disk of `.fud` sources by absolute path. */
function disk(files: Record<string, string>): (path: string) => string | undefined {
  return (path) => files[path];
}

describe('componentFiles — criterion 5, what a component reads', () => {
  it('is the component and, transitively, every component it links relatively, each once', () => {
    const read = disk({
      'C:/p/src/app-card.fud':
        '<link rel="component" href="./app-badge.fud">\n<link href="../ui/app-icon.fud" rel=\'component\'>\n<app-card></app-card>',
      'C:/p/src/app-badge.fud': '<link rel="component" href="../ui/app-icon.fud">\n<link rel="component" href="./app-card.fud">',
      'C:/p/ui/app-icon.fud': '<app-icon></app-icon>',
    });
    expect([...componentFiles('C:\\p\\src\\app-card.fud', read)].sort()).toEqual([
      'C:/p/src/app-badge.fud',
      'C:/p/src/app-card.fud',
      'C:/p/ui/app-icon.fud',
    ]);
  });

  it('does not follow a library, a stylesheet, a link without href, or a file it cannot read', () => {
    const read = disk({
      'C:/p/src/app-card.fud':
        '<link rel="component" href="@acme/ui/button.fud">\n' +
        '<link rel="stylesheet" href="./theme.css">\n' +
        '<link rel="component">\n' +
        '<link rel="component" href="./gone.fud">',
    });
    expect([...componentFiles('C:/p/src/app-card.fud', read)]).toEqual(['C:/p/src/app-card.fud', 'C:/p/src/gone.fud']);
  });

  it('is the component alone when it cannot be read', () => {
    expect([...componentFiles('C:/p/src/app-card.fud', () => undefined)]).toEqual(['C:/p/src/app-card.fud']);
  });
});
