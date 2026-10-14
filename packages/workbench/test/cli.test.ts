import { FUD0970 } from '@fudic/diagnostics';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BenchMessage } from '../src/protocol.js';
import type { WorkbenchSession } from '../src/types.js';

const open = vi.hoisted(() => vi.fn());
vi.mock('../src/open.js', () => ({ openWorkbench: open, nodeTargetFs: {} }));
const runMain = vi.hoisted(() => vi.fn());
vi.mock('../src/run-cli.js', () => ({ runMain }));

const { main, parseArgs, processIo, USAGE } = await import('../src/cli.js');

afterEach(() => {
  open.mockReset();
  runMain.mockReset();
  vi.restoreAllMocks();
});

describe('parseArgs', () => {
  it('reads a file, a port, --keep, a browser and the workers, in any order', () => {
    expect(parseArgs(['a.fud'])).toEqual({ file: 'a.fud', options: {} });
    expect(parseArgs(['--keep', 'a.fud', '--port', '5173'])).toEqual({ file: 'a.fud', options: { port: 5173, keep: true } });
    expect(parseArgs(['a.fud', '--port', '0'])).toEqual({ file: 'a.fud', options: { port: 0 } });
    expect(parseArgs(['--browser', 'msedge', 'a.fud', '--workers', '2'])).toEqual({
      file: 'a.fud',
      options: { browser: 'msedge', workers: 2 },
    });
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
    expect(parseArgs(['a.fud', '--browser', 'opera'])).toBeUndefined();
    expect(parseArgs(['a.fud', '--browser'])).toBeUndefined();
    expect(parseArgs(['a.fud', '--workers', '0'])).toBeUndefined();
    expect(parseArgs(['a.fud', '--workers', '1.5'])).toBeUndefined();
  });

  it('names the new options in the usage', () => {
    expect(USAGE).toBe(
      'usage: fudic-workbench <file> [--port <n>] [--keep] [--browser <auto|chrome|msedge|chromium|firefox|webkit>] [--workers <n>]',
    );
  });
});

function io() {
  const lines: string[] = [];
  const exits: number[] = [];
  let onExit: (() => void) | undefined;
  let onLine: ((line: string) => void) | undefined;
  return {
    lines,
    exits,
    exitNow: () => onExit?.(),
    send: (line: string) => onLine?.(line),
    io: {
      cwd: 'C:/p',
      write: (line: string) => lines.push(line),
      onLine: (callback: (line: string) => void) => {
        onLine = callback;
      },
      onExit: (callback: () => void) => {
        onExit = callback;
      },
      exit: (code: number) => exits.push(code),
    },
  };
}

/** A workbench as `openWorkbench` answers it, recording what it is asked. */
function session(steps: string[], options: { onMessage?: (m: BenchMessage) => void } = {}): WorkbenchSession {
  return {
    url: 'http://127.0.0.1:1/__bench/app-card/',
    tag: 'app-card',
    component: 'C:/p/app-card.fud',
    criteria: 3,
    browser: 'msedge',
    async open(file) {
      steps.push(`open ${file}`);
      if (file.endsWith('index.fud')) return { diagnostic: FUD0970({ file }) };
      return { url: 'http://127.0.0.1:1/__bench/app-badge/', tag: 'app-badge', component: file, criteria: 1 };
    },
    closeComponent(tag) {
      steps.push(`close ${tag}`);
    },
    command(command) {
      steps.push(`${command.type} ${command.tag}`);
      options.onMessage?.({ v: 2, type: 'state', tag: command.tag, paused: false, pinned: null, pending: 0 });
    },
    close: async () => {
      steps.push('close');
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
    expect(open).toHaveBeenCalledWith('a.fud', { port: 5173, onMessage: expect.any(Function) as unknown });
  });

  it('prints the first JSON line with the browser, lives, and closes before exiting 0', async () => {
    const steps: string[] = [];
    open.mockResolvedValue(session(steps));
    const t = io();
    await main(['app-card.fud', '--keep', '--browser', 'msedge', '--workers', '2'], t.io);
    expect(t.lines).toEqual([
      '{"url":"http://127.0.0.1:1/__bench/app-card/","tag":"app-card","component":"C:/p/app-card.fud","criteria":3,"browser":"msedge"}',
    ]);
    expect(open).toHaveBeenCalledWith('app-card.fud', {
      keep: true,
      browser: 'msedge',
      workers: 2,
      onMessage: expect.any(Function) as unknown,
    });
    expect(t.exits).toEqual([]);
    t.exitNow();
    await vi.waitFor(() => expect(t.exits).toEqual([0]));
    expect(steps).toEqual(['close']);
  });

  it('the messages before the first line wait for it; the ones after are lines at once', async () => {
    const steps: string[] = [];
    let publish: (m: BenchMessage) => void = () => undefined;
    open.mockImplementation(async (_file: string, options: { onMessage: (m: BenchMessage) => void }) => {
      publish = options.onMessage;
      publish({ v: 2, type: 'problem', message: 'early' });
      return session(steps);
    });
    const t = io();
    await main(['app-card.fud'], t.io);
    publish({ v: 2, type: 'problem', message: 'late' });
    expect(t.lines.map((l) => (JSON.parse(l) as { message?: string; tag?: string }).message ?? 'first')).toEqual([
      'first',
      'early',
      'late',
    ]);
  });
});

describe('main — criteria 5 and 10, commands on stdin', () => {
  async function opened() {
    const steps: string[] = [];
    let publish: (m: BenchMessage) => void = () => undefined;
    open.mockImplementation(async (_file: string, options: { onMessage: (m: BenchMessage) => void }) => {
      publish = options.onMessage;
      return session(steps, { onMessage: (m) => publish(m) });
    });
    const t = io();
    await main(['app-card.fud'], t.io);
    t.lines.length = 0;
    return { t, steps };
  }

  it('open answers opened on stdout; a file that is no component answers error', async () => {
    const { t, steps } = await opened();
    t.send('{"v":2,"type":"open","file":"C:/p/app-badge.fud"}');
    t.send('{"v":2,"type":"open","file":"C:/p/index.fud"}');
    await vi.waitFor(() => expect(t.lines).toHaveLength(2));
    expect(t.lines.map((l) => JSON.parse(l) as unknown)).toEqual([
      {
        v: 2,
        type: 'opened',
        url: 'http://127.0.0.1:1/__bench/app-badge/',
        tag: 'app-badge',
        component: 'C:/p/app-badge.fud',
        criteria: 1,
        file: 'C:/p/app-badge.fud',
      },
      {
        v: 2,
        type: 'error',
        file: 'C:/p/index.fud',
        error: { code: 'FUD0970', message: 'C:/p/index.fud is not a component with a tag, nor the .fudspec of one' },
      },
    ]);
    expect(steps).toEqual(['open C:/p/app-badge.fud', 'open C:/p/index.fud']);
  });

  it('close, run, pin, pause and cancel go to the workbench and answer nothing but what it publishes', async () => {
    const { t, steps } = await opened();
    t.send('{"v":2,"type":"close","tag":"app-badge"}');
    t.send('{"v":2,"type":"run","tag":"app-card","ids":["a"]}');
    t.send('{"v":2,"type":"pin","tag":"app-card","id":"a"}');
    t.send('{"v":2,"type":"pause","tag":"app-card","paused":true}');
    t.send('{"v":2,"type":"cancel","tag":"app-card"}');
    await vi.waitFor(() => expect(steps).toHaveLength(5));
    expect(steps).toEqual(['close app-badge', 'run app-card', 'pin app-card', 'pause app-card', 'cancel app-card']);
    await new Promise((done) => setTimeout(done, 0));
    expect(t.lines.map((l) => (JSON.parse(l) as { type: string }).type)).toEqual(['state', 'state', 'state', 'state']);
  });

  it('a line that is not a command is ignored', async () => {
    const { t, steps } = await opened();
    t.send('hello');
    t.send('{"v":1,"type":"cancel","tag":"app-card"}');
    await new Promise((done) => setTimeout(done, 0));
    expect([...steps, ...t.lines]).toEqual([]);
  });
});

describe('main — run', () => {
  it('hands `run` and the rest of its arguments to runMain, with the folder it started in', async () => {
    const t = io();
    await main(['run', 'src', '--json'], t.io);
    expect(runMain).toHaveBeenCalledWith(['src', '--json'], { write: t.io.write, exit: t.io.exit, cwd: 'C:/p' });
    expect(open).not.toHaveBeenCalled();
  });
});

describe('processIo', () => {
  /** The handlers processIo registers on stdin and on the process, by `stdin:<event>`. */
  function hooked(): Record<string, (arg?: unknown) => void> {
    const handlers: Record<string, (arg?: unknown) => void> = {};
    vi.spyOn(process.stdin, 'setEncoding').mockImplementation(() => process.stdin);
    vi.spyOn(process.stdin, 'on').mockImplementation(((event: string, h: () => void) => {
      handlers[`stdin:${event}`] = h;
      return process.stdin;
    }) as never);
    return handlers;
  }

  it('writes a line to stdout, exits with the code, and knows its folder', () => {
    hooked();
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const real = processIo();
    real.write('{"a":1}');
    real.exit(1);
    expect(write).toHaveBeenCalledWith('{"a":1}\n');
    expect(exit).toHaveBeenCalledWith(1);
    expect(real.cwd).toBe(process.cwd());
  });

  it('reads stdin a line at a time, whatever the chunks, with or without \\r', () => {
    const handlers = hooked();
    const real = processIo();
    const lines: string[] = [];
    real.onLine((line) => lines.push(line));
    handlers['stdin:data']!('{"a"');
    expect(lines).toEqual([]);
    handlers['stdin:data']!(':1}\r\n{"b":2}\n{"c"');
    handlers['stdin:data']!(':3}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  it('calls back once, when stdin ends or SIGINT arrives, whichever is first', () => {
    const handlers = hooked();
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
