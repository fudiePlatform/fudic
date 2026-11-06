/** The command line of fudic-mcp (§3.1). */

import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, USAGE, parseArgs } from '../src/args.js';

describe('parseArgs', () => {
  it('stdio by default', () => {
    expect(parseArgs([])).toEqual({ options: { http: false, tunnel: false, port: 4317, newSecret: false } });
    expect(DEFAULT_PORT).toBe(4317);
  });

  it('every option of http', () => {
    expect(parseArgs(['--http', '--tunnel', '--port', '5000', '--new-secret'])).toEqual({
      options: { http: true, tunnel: true, port: 5000, newSecret: true },
    });
  });

  it.each([['--help'], ['-h']])('%s asks for the usage, whatever follows', (flag) => {
    expect(parseArgs([flag, '--nope'])).toEqual({ help: true });
  });

  it.each([[['--port']], [['--http', '--port', 'x']], [['--http', '--port', '0']], [['--http', '--port', '65536']], [['--http', '--port', '1.5']]])(
    '%j: the port is a number from 1 to 65535',
    (argv) => {
      expect(parseArgs(argv)).toEqual({ error: '--port takes a number from 1 to 65535' });
    },
  );

  it('the edges of the port', () => {
    expect(parseArgs(['--http', '--port', '1'])).toMatchObject({ options: { port: 1 } });
    expect(parseArgs(['--http', '--port', '65535'])).toMatchObject({ options: { port: 65_535 } });
  });

  it('an unknown option', () => {
    expect(parseArgs(['--stdio'])).toEqual({ error: 'unknown option --stdio' });
  });

  it.each([[['--tunnel']], [['--new-secret']], [['--port', '5000']]])('%j goes with --http', (argv) => {
    expect(parseArgs(argv)).toEqual({ error: '--tunnel, --port and --new-secret go with --http' });
  });

  it('the default port alone does not need --http', () => {
    expect(parseArgs(['--port', '4317'])).toMatchObject({ options: { http: false } });
  });

  it('the usage shows each way to start it', () => {
    for (const line of ['fudic-mcp --http --tunnel', 'fudic-mcp --http --port 5000', 'fudic-mcp --http --new-secret', '127.0.0.1:4317']) {
      expect(USAGE).toContain(line);
    }
  });
});
