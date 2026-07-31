import { describe, expect, it } from 'vitest';
import { reindentLine } from '../src/on-type.js';

/** Apply the reindent, so the assertions read as the line the user would see. */
function typed(source: string, at: string): string {
  const offset = source.indexOf(at) + at.length;
  const edit = reindentLine(source, offset);
  if (edit === undefined) return source;
  return source.slice(0, edit.span.start) + edit.text + source.slice(edit.span.end);
}

describe('reindentLine', () => {
  it('lines a closing brace up with the brace it closes', () => {
    const source = '@if (a) {\n  <p>x</p>\n        }';
    expect(typed(source, '        }')).toBe('@if (a) {\n  <p>x</p>\n}');
  });

  it('skips over a pair that already closed', () => {
    const source = '@if (a) {\n  @if (b) { <p>x</p> }\n     }';
    expect(typed(source, '     }')).toBe('@if (a) {\n  @if (b) { <p>x</p> }\n}');
  });

  it('lines a closing tag up with the tag it closes', () => {
    const source = '<div>\n  <p>x</p>\n      </div>';
    expect(typed(source, '      </div>')).toBe('<div>\n  <p>x</p>\n</div>');
  });

  it('counts, so a nested pair of the same tag does not fool it', () => {
    const source = '<div>\n  <div>\n    <p>x</p>\n  </div>\n</div>';
    // The inner `</div>` is already right where it belongs: nothing to do.
    expect(reindentLine(source, source.indexOf('  </div>') + 8)).toBeUndefined();
  });

  it('counts the pairs that already closed, so a sibling does not steal the anchor', () => {
    const source = '<div>\n  <div>x</div>\n      </div>';
    expect(typed(source, '      </div>')).toBe('<div>\n  <div>x</div>\n</div>');
  });

  it('does nothing when the line is already where it belongs', () => {
    expect(reindentLine('@if (a) {\n}', 10)).toBeUndefined();
  });

  it('does nothing when the count does not come out', () => {
    // Half-written files are the normal state of an editor, and the answer there is silence.
    expect(reindentLine('  }', 3)).toBeUndefined();
    expect(reindentLine('  </div>', 8)).toBeUndefined();
  });

  it('does nothing for a line that is not a lone closer', () => {
    expect(reindentLine('<p>text</p>', 11)).toBeUndefined();
    expect(reindentLine('  <p>a</p> more', 15)).toBeUndefined();
  });

  it('works on the first line of a file, where there is no line before', () => {
    expect(reindentLine('}', 1)).toBeUndefined();
  });
});
