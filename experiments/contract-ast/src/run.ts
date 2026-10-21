/**
 * For every simulation under `sims/`: find the `<link rel="server">` of its `.fud` files, read
 * each contract with Oxc, follow what it imports, and write to `output/<sim>/`:
 *
 *   ast/<file>.json  what Oxc gives, untouched (program, module summary, comments, errors)
 *   model.json       the normalised contract a backend generator would read
 *   report.md        the same, for a human, with every issue
 *
 * and `output/SUMMARY.md` across all simulations. Run: `pnpm ast` (all) or `pnpm ast 01`.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Contracts } from './contract.ts';
import type { ContractModel, SimModel } from './model.ts';
import { Project } from './project.ts';
import { report, summary } from './report.ts';
import { Scopes } from './scope.ts';
import { Types } from './types.ts';
import { Values } from './values.ts';

const here = dirname(fileURLToPath(import.meta.url));
const SIMS = resolve(here, '../sims');
const OUTPUT = resolve(here, '../output');

function simulate(sim: string): { model: SimModel; project: Project } {
  const root = join(SIMS, sim);
  const project = new Project(root);
  const scopes = new Scopes(project);
  const types = new Types(project, scopes);
  const values = new Values(project, scopes, types);
  types.onQuery((file, node) => {
    project.report('error', 'typeof-in-data', '`typeof` inside a data type', file, node);
    return { kind: 'unsupported', what: 'typeof' };
  });
  const contracts = new Contracts(project, scopes, types, values);

  const models: ContractModel[] = [];
  for (const fud of walk(root).filter((f) => f.endsWith('.fud'))) {
    for (const href of serverLinks(readFileSync(fud, 'utf8'))) {
      const target = resolve(dirname(fud), href);
      const file = project.parse(target);
      if (file === null) {
        project.report('error', 'missing-contract', `<link rel="server" href="${href}"> points at nothing`, project.rel(fud), null);
        continue;
      }
      models.push(contracts.read(project.rel(fud), file));
    }
  }

  const model: SimModel = {
    sim,
    files: project.files().map((f) => f.rel).sort(),
    contracts: models,
    types: types.named,
    middlewares: values.middlewares,
    forms: values.forms,
    issues: project.issues,
  };
  return { model, project };
}

/**
 * `<link … rel="server" … href="…">`, attributes in any order. Read from the raw text on
 * purpose: the simulations keep the link inside a `@* … *@` comment, because today's compiler
 * does not know it, and this still finds it.
 */
function serverLinks(source: string): string[] {
  const out: string[] = [];
  for (const tag of source.match(/<link\b[^>]*>/giu) ?? []) {
    const rel = /\brel\s*=\s*"([^"]*)"/iu.exec(tag)?.[1];
    const href = /\bhref\s*=\s*"([^"]*)"/iu.exec(tag)?.[1];
    if (rel === 'server' && href !== undefined) out.push(href);
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const filter = process.argv[2];
const sims = readdirSync(SIMS).filter((s) => statSync(join(SIMS, s)).isDirectory() && (filter === undefined || s.startsWith(filter))).sort();
const results: SimModel[] = [];

for (const sim of sims) {
  const { model, project } = simulate(sim);
  const out = join(OUTPUT, sim);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'ast'), { recursive: true });

  // The raw AST of every file the contract reached: the same parse the model was read from.
  for (const parsed of project.files()) {
    const dump = join(out, 'ast', `${parsed.rel}.json`);
    mkdirSync(dirname(dump), { recursive: true });
    writeFileSync(dump, JSON.stringify({ errors: parsed.errors, module: parsed.module, comments: parsed.comments, program: parsed.program }, null, 1));
  }
  writeFileSync(join(out, 'model.json'), JSON.stringify(model, null, 2));
  writeFileSync(join(out, 'report.md'), report(model));
  results.push(model);

  const errors = model.issues.filter((i) => i.severity === 'error').length;
  const notes = model.issues.length - errors;
  const fns = model.contracts.reduce((n, c) => n + c.functions.length, 0);
  console.info(`${sim}: ${String(model.contracts.length)} contracts, ${String(fns)} functions, ${String(Object.keys(model.types).length)} types, ${String(errors)} errors, ${String(notes)} notes`);
}

if (filter === undefined) writeFileSync(join(OUTPUT, 'SUMMARY.md'), summary(results));
