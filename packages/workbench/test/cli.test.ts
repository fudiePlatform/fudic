import { FUD0970 } from '@fudic/diagnostics';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchSession } from '../src/types.js';

const open = vi.hoisted(() => vi.fn());
vi.mock('../src/open.js', () => ({ openWorkbench: open }));

const { main, parseArgs, processIo, USAGE } = await import('../src/cli.js');

afterEach(() => {
  open.mockReset();
  vi.restoreAllMocks();
});

describe('parseArgs', () => {
  it('reads a file, a port and --keep, in any order', () => {
    expect(parseArgs(['a.fud'])).toEqual({ file: 'a.fud', options: {} });
    expect(parseArgs(['--keep', 'a.fud', '--port', '5173'])).toEqual({ file: 'a.fud', options: { port: 5173, keep: true } });
    expect(parseArgs(['a.fud', '--port', '0'])).toEqual({ file: 'a.fud', options: { port: 0 } });
  });

  it('refuses anything else', () => {
    expect(parseArgs([])).toBeUndefined();
    expect(parseArgs(['--keep'])).toBeUndefined();
    expect(parseArgs(['a.fud', 'b.fud'])).toBeUndefined();
    expect(parseArgs(['a.fud', '--verbose'])).toBeUndefined();
    expect(parseArgs(['a.fud', '--port'])).toBeUndefined();
    expect(parseArgs(['a.fud', '--port', 'x'])).toBeUndefined();
    expect(parseArgs(['a.fud', '--port', '-1'])).toBeUndefined();
    expect(parseArgs(['a.fud', '--port', '1.5'])).toBeUndefined();
  });
});

function io() {
  const lines: string[] = [];
  const exits: number[] = [];
  let onExit: (() => void) | undefined;
  return {
    lines,
    exits,
    exitNow: () => onExit?.(),
    io: {
      write: (line: string) => lines.push(line),
      onExit: (callback: () => void) => {
        onExit = callback;
      },
      exit: (code: number) => exits.push(code),
    },
  };
}

describe('main', () => {
  it('prints the usage as an error line, exit 1, for bad arguments', async () => {
    const t = io();
    await main([], t.io);
    expect(t.lines.map((l) => JSON.parse(l) as unknown)).toEqual([{ error: { message: USAGE } }]);
    expect(t.exits).toEqual([1]);
    expect(open).not.toHaveBeenCalled();
  });

  it('prints the diagnostic of a failure as an error line, exit 1', async () => {
    open.mockResolvedValue({ diagnostic: FUD0970({ file: 'C:/p/index.fud' }) });
    const t = io();
    await main(['C:/p/index.fud'], t.io);
    expect(JSON.parse(t.lines[0]!)).toEqual({
      error: { code: 'FUD0970', message: 'C:/p/index.fud is not a component with a tag, nor the .fudspec of one' },
    });
    expect(t.exits).toEqual([1]);
  });

  it('prints the first line of what opening threw, never a stack', async () => {
    open.mockRejectedValue(new Error('listen EADDRINUSE: address already in use 127.0.0.1:5173\n    at Server'));
    const t = io();
    await main(['a.fud', '--port', '5173'], t.io);
    expect(JSON.parse(t.lines[0]!)).toEqual({ error: { message: 'listen EADDRINUSE: address already in use 127.0.0.1:5173' } });
    expect(t.exits).toEqual([1]);
    expect(open).toHaveBeenCalledWith('a.fud', { port: 5173 });
  });

  it('prints the one JSON line, lives, and closes before exiting 0', async () => {
    const steps: string[] = [];
    const session: WorkbenchSession = {
      url: 'http://127.0.0.1:1/__bench/',
      tag: 'app-card',
      component: 'C:/p/app-card.fud',
      criteria: 3,
      close: async () => {
        steps.push('close');
      },
    };
    open.mockResolvedValue(session);
    const t = io();
    await main(['app-card.fud', '--keep'], t.io);
    expect(t.lines).toEqual([
      '{"url":"http://127.0.0.1:1/__bench/","tag":"app-card","component":"C:/p/app-card.fud","criteria":3}',
    ]);
    expect(open).toHaveBeenCalledWith('app-card.fud', { keep: true });
    expect(t.exits).toEqual([]);
    t.exitNow();
    await vi.waitFor(() => expect(t.exits).toEqual([0]));
    expect(steps).toEqual(['close']);
  });
});

describe('processIo', () => {
  it('writes a line to stdout and exits with the code', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const real = processIo();
    real.write('{"a":1}');
    real.exit(1);
    expect(write).toHaveBeenCalledWith('{"a":1}\n');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('calls back once, when stdin ends or SIGINT arrives, whichever is first', () => {
    const handlers: Record<string, () => void> = {};
    vi.spyOn(process.stdin, 'on').mockImplementation(((event: string, h: () => void) => {
      handlers[`stdin:${event}`] = h;
      return process.stdin;
    }) as never);
    vi.spyOn(process, 'on').mockImplementation(((event: string, h: () => void) => {
      handlers[`process:${event}`] = h;
      return process;
    }) as never);
    const resume = vi.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin);
    let calls = 0;
    processIo().onExit(() => (calls += 1));
    expect(resume).toHaveBeenCalled();
    handlers['stdin:end']!();
    handlers['process:SIGINT']!();
    handlers['stdin:end']!();
    expect(calls).toBe(1);
  });
});
