/**
 * The executable (SDD-24 §3.1).
 *
 * A server started with no transport hangs forever, and from the editor side that is the hardest
 * failure there is to diagnose — hence a usage error rather than a silent wait.
 */

import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { Connection } from '@volar/language-server/node';
import { createConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-languageserver/node';
import { main, parseTransport } from '../src/cli.js';

describe('parseTransport', () => {
  it.each([
    ['--stdio', { kind: 'stdio' }],
    ['--node-ipc', { kind: 'node-ipc' }],
    ['--socket=6009', { kind: 'socket', port: 6009 }],
  ])('reads %s', (argument, expected) => {
    expect(parseTransport([argument])).toEqual(expected);
  });

  it('finds the flag wherever the client put it', () => {
    expect(parseTransport(['--clientProcessId=1', '--stdio'])).toEqual({ kind: 'stdio' });
  });

  it.each([[[]], [['--socket']], [['--socket=abc']], [['--pipe=x']]])(
    'says nothing for %s',
    (argv) => {
      expect(parseTransport(argv)).toBeUndefined();
    },
  );
});

describe('main', () => {
  it('starts the server on the connection it was given', () => {
    const connection = { id: 'connection' } as unknown as Connection;
    const started: Connection[] = [];

    const code = main(['--stdio'], {
      createConnection: () => connection,
      start: (given) => started.push(given),
      write: () => undefined,
    });

    expect(code).toBe(0);
    expect(started).toEqual([connection]);
  });

  it('really starts a server: the default wiring, on a real connection', () => {
    // A pipe nobody writes to, so the server listens and waits — which is all `--stdio` does
    // before an editor says anything.
    const toServer = new PassThrough();
    const fromServer = new PassThrough();
    const connection = createConnection(
      new StreamMessageReader(toServer),
      new StreamMessageWriter(fromServer),
    );

    try {
      expect(main(['--stdio'], { createConnection: () => connection })).toBe(0);
    } finally {
      connection.dispose();
      toServer.destroy();
      fromServer.destroy();
    }
  });

  it('refuses clearly when no transport was asked for', () => {
    const written: string[] = [];
    let started = false;

    const code = main([], {
      createConnection: () => ({}) as Connection,
      start: () => {
        started = true;
      },
      write: (message) => written.push(message),
    });

    expect(code).toBe(1);
    expect(started).toBe(false);
    expect(written).toEqual([
      'usage: fudic-language-server --stdio | --node-ipc | --socket=<port>',
    ]);
  });

  it('writes the usage where a launcher can see it, with no help from the test', () => {
    const stderr: string[] = [];
    const write = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
      stderr.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      expect(main([], { createConnection: () => ({}) as Connection })).toBe(1);
    } finally {
      process.stderr.write = write;
    }

    expect(stderr).toEqual([`${'usage: fudic-language-server --stdio | --node-ipc | --socket=<port>'}
`]);
  });
});
