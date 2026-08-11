/**
 * `fudic.toggleComment` (BUG-22 §5), in the two states that matter.
 */

import { describe, expect, it } from 'vitest';
import { COMMENT_SYNTAX_REQUEST, toggleCommentCommand } from '../../src/commands/comment.js';
import { NO_ACTIVE_FUD, SERVER_DOWN } from '../../src/commands/messages.js';
import { commandFixture } from './_deps.js';
import type { CommentSelection } from '../../src/ports.js';

const SELECTION: CommentSelection = {
  uri: 'file:///x.fud',
  lines: ['<app-x>', '  <p>hola</p>', '</app-x>'],
  firstLine: 1,
  lastLine: 1,
  offset: 10,
};

const RAZOR = {
  block: ['@*', '*@'],
  removes: [
    ['@*', '*@'],
    ['<!--', '-->'],
  ],
};

describe('toggleComment', () => {
  it('asks the server about the offset under the caret and replaces the lines', async () => {
    const { deps, recording } = commandFixture({
      selection: SELECTION,
      answers: { [COMMENT_SYNTAX_REQUEST]: RAZOR },
    });

    await toggleCommentCommand(deps);

    expect(recording.requests).toEqual([
      { method: COMMENT_SYNTAX_REQUEST, params: { uri: 'file:///x.fud', offset: 10 } },
    ]);
    expect(recording.replacements).toEqual([
      { firstLine: 1, lastLine: 1, newLines: ['  @* <p>hola</p> *@'] },
    ]);
  });

  it('says so when the active document is not a .fud', async () => {
    const { deps, recording } = commandFixture({});

    await toggleCommentCommand(deps);

    expect(recording.warnings).toEqual([NO_ACTIVE_FUD]);
    expect(recording.requests).toEqual([]);
  });

  it('says so when the server is down: nobody can say what a comment is here', async () => {
    const { deps, recording } = commandFixture({ selection: SELECTION, running: false });

    await toggleCommentCommand(deps);

    expect(recording.warnings).toEqual([SERVER_DOWN]);
    expect(recording.replacements).toEqual([]);
  });

  it('reports a request that died with the server, and changes nothing', async () => {
    const { deps, recording } = commandFixture({
      selection: SELECTION,
      rejects: [COMMENT_SYNTAX_REQUEST],
    });

    await toggleCommentCommand(deps);

    expect(recording.warnings[0]).toContain(COMMENT_SYNTAX_REQUEST);
    expect(recording.replacements).toEqual([]);
  });
});
