/**
 * The server as a client sees it (criteria 1, 4 and 7): its tools, its instructions, its prompt,
 * and the guide through `fudic_guide`, with the common shape of every answer.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createServer, toolNames, type Entry } from '../src/server.js';
import { Guide, TOPICS } from '../src/guide.js';
import { instructions, newAppPrompt } from '../src/instructions.js';
import { VERSION } from '../src/version.js';
import { connect, fakeProject } from './helpers.js';

const clients: Client[] = [];

async function client(entry: Entry, guide?: Guide): Promise<Client> {
  const c = await connect(createServer({ project: fakeProject(), entry, ...(guide !== undefined ? { guide } : {}) }));
  clients.push(c);
  return c;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

interface Answer {
  readonly structured: Record<string, unknown>;
  readonly isError: boolean;
}

async function guide(c: Client, topic: string): Promise<Answer> {
  const result = await c.callTool({ name: 'fudic_guide', arguments: { topic } });
  const content = result.content as { type: string; text: string }[];
  // The same JSON for a client that does not read structured content.
  expect(content).toHaveLength(1);
  expect(JSON.parse(content[0]!.text)).toEqual(result.structuredContent);
  return { structured: result.structuredContent as Record<string, unknown>, isError: result.isError === true };
}

describe('the server (criterion 1)', () => {
  it('lists the tools of its entry: the file tools only over http', async () => {
    for (const entry of ['stdio', 'http'] as const) {
      const { tools } = await (await client(entry)).listTools();
      expect(tools.map((t) => t.name)).toEqual([...toolNames(entry)]);
    }
    // Criterion 1: fourteen over stdio, seventeen over http.
    const common = [
      'fudic_guide',
      'fudic_status',
      'fudic_check',
      'fudic_fix',
      'fudic_format',
      'fudic_symbols',
      'fudic_describe',
      'fudic_contract',
      'fudic_new',
      'fudic_generate',
      'fudic_add',
      'fudic_record',
      'fudic_test',
      'fudic_spec_run',
    ];
    expect([...toolNames('stdio')]).toEqual(common);
    expect(common).toHaveLength(14);
    expect([...toolNames('http')]).toEqual([...common, 'fudic_files', 'fudic_read', 'fudic_write']);
  });

  it('answers the same call the same over both entries, byte for byte', async () => {
    const stdio = await client('stdio');
    const http = await client('http');
    for (const topic of ['overview', 'FUD0540', 'react']) {
      const a = await stdio.callTool({ name: 'fudic_guide', arguments: { topic } });
      const b = await http.callTool({ name: 'fudic_guide', arguments: { topic } });
      expect(a).toEqual(b);
    }
  });

  it('is called fudic, at the package version', async () => {
    const c = await client('stdio');
    expect(c.getServerVersion()).toMatchObject({ name: 'fudic', version: VERSION });
  });

  it('rejects an input that does not fit the schema before the tool sees it', async () => {
    const result = await (await client('stdio')).callTool({ name: 'fudic_guide', arguments: { topic: 7 } });
    expect(result.isError).toBe(true);
  });
});

describe('what the client is told (criterion 4)', () => {
  it('instructions: never from memory, and only the tools that are there', async () => {
    const c = await client('http');
    expect(c.getInstructions()).toBe(instructions(toolNames('http')));
    expect(c.getInstructions()).toBe(
      [
        'fudic is a UI framework you have no prior knowledge of. Never write fudic code from memory or by analogy with React, Vue or any other framework.',
        'For any fudic task, the first call is fudic_status. Do what its "next" says, one step at a time.',
        'Before writing a kind of file for the first time, call fudic_guide for its topic. Start with fudic_guide { topic: "overview" }.',
        'Create files with fudic_generate, never from scratch.',
        'After every write, run fudic_check and fix every diagnostic before moving on.',
        'Never approve on the user\'s behalf: fudic_record "approved" only after the user said so in this conversation.',
      ].join('\n'),
    );
  });

  it('instructions, once every tool is there, say the text of the spec', () => {
    const all = new Set(['fudic_guide', 'fudic_status', 'fudic_generate', 'fudic_check', 'fudic_record']);
    expect(instructions(all)).toBe(
      [
        'fudic is a UI framework you have no prior knowledge of. Never write fudic code from memory or by analogy with React, Vue or any other framework.',
        'For any fudic task, the first call is fudic_status. Do what its "next" says, one step at a time.',
        'Before writing a kind of file for the first time, call fudic_guide for its topic. Start with fudic_guide { topic: "overview" }.',
        'Create files with fudic_generate, never from scratch.',
        'After every write, run fudic_check and fix every diagnostic before moving on.',
        'Never approve on the user\'s behalf: fudic_record "approved" only after the user said so in this conversation.',
      ].join('\n'),
    );
  });

  it('every tool description starts by naming fudic', async () => {
    for (const entry of ['stdio', 'http'] as const) {
      const { tools } = await (await client(entry)).listTools();
      for (const tool of tools) expect(tool.description?.split('. ')[0], tool.name).toMatch(/\bfudic\b/u);
    }
  });

  it('fudic_guide is read-only and names its topics', async () => {
    const { tools } = await (await client('stdio')).listTools();
    const tool = tools.find((t) => t.name === 'fudic_guide')!;
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    for (const topic of TOPICS) expect(tool.description).toContain(topic);
  });

  it('offers the new-app prompt, which starts from the guide while there is no fudic_status', async () => {
    const c = await client('http');
    const { prompts } = await c.listPrompts();
    expect(prompts).toEqual([expect.objectContaining({ name: 'new-app', description: 'Create a fudic app or library from this conversation' })]);
    const prompt = await c.getPrompt({ name: 'new-app' });
    expect(prompt.messages).toEqual([{ role: 'user', content: { type: 'text', text: newAppPrompt(toolNames('http')) } }]);
    expect(newAppPrompt(new Set())).toContain('Start by reading fudic_guide { topic: "overview" } and { topic: "workflow" }.');
  });

  it('the new-app prompt sends to fudic_status once it exists', () => {
    const text = newAppPrompt(new Set(['fudic_status']));
    expect(text).toContain('Start with fudic_status and do what it says.');
    expect(text).toContain('Ask me only what you need');
  });
});

describe('fudic_guide (criterion 7)', () => {
  it('answers every topic in the common shape', async () => {
    const c = await client('http');
    for (const topic of TOPICS) {
      const { structured, isError } = await guide(c, topic);
      expect(isError).toBe(false);
      expect(Object.keys(structured)).toEqual(['fudicVersion', 'commit', 'topic', 'related', 'body', 'diagnostics', 'next']);
      expect(structured).toMatchObject({ fudicVersion: VERSION, commit: 'b59fa7d', topic, diagnostics: [], next: null });
      expect(structured['body']).toMatch(/^# /u);
      expect(structured['related']).not.toContain(topic);
    }
  });

  it('a code gives its title, why, fix and the topics that explain the construction', async () => {
    const { structured, isError } = await guide(await client('stdio'), 'FUD0540');
    expect(isError).toBe(false);
    expect(structured).toMatchObject({ topic: 'FUD0540', severity: 'error' });
    expect(structured['title']).toEqual(expect.any(String));
    expect(structured['why']).toEqual(expect.any(String));
    expect(structured['fix']).toEqual(expect.any(String));
    expect(structured['related']).toContain('components');
  });

  it('a TypeScript code has no explanation of its own, and nothing is made up', async () => {
    const { structured, isError } = await guide(await client('stdio'), 'TS2322');
    expect(isError).toBe(false);
    expect(structured).toMatchObject({ topic: 'TS2322', related: [] });
    expect(structured['body']).toContain('TS2322 is a TypeScript error, not a fudic one');
    expect(structured).not.toHaveProperty('why');
  });

  it.each([['FUD9999'], ['react']])('%s is not a topic: FUD1403, as an error', async (topic) => {
    const { structured, isError } = await guide(await client('stdio'), topic);
    expect(isError).toBe(true);
    expect(structured).toMatchObject({ topic, next: null });
    const [d] = structured['diagnostics'] as { code: string; severity: string; message: string }[];
    expect(d).toEqual({ code: 'FUD1403', severity: 'error', message: expect.stringContaining(`there is no guide topic "${topic}"`) });
    // A project diagnostic: no place, and its why once, under codes.
    expect(structured['codes']).toHaveProperty('FUD1403.title', 'Unknown guide topic');
  });

  it('a shared guide serves every session', async () => {
    const shared = new Guide();
    const a = await guide(await client('http', shared), 'view');
    const b = await guide(await client('http', shared), 'view');
    expect(a).toEqual(b);
  });
});
