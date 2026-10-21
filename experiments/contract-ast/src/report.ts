/** The model of a simulation, and all of them together, as Markdown for a human. */

import type { FormField, FunctionModel, SimModel, TypeModel } from './model.ts';

export function typeText(t: TypeModel): string {
  switch (t.kind) {
    case 'number': return t.width ?? 'number(?)';
    case 'array': return `${wrap(t.of)}[]`;
    case 'record': return `Record<string, ${typeText(t.of)}>`;
    case 'nullable': return `${typeText(t.of)} | null`;
    case 'enum': return t.values.map((v) => JSON.stringify(v)).join(' | ');
    case 'object': return `{ ${t.fields.map((f) => `${f.name}${f.optional ? '?' : ''}: ${typeText(f.type)}`).join('; ')} }`;
    case 'named': return t.ref.split('#')[1] ?? t.ref;
    case 'form': return `form ${t.ref.split('#')[1] ?? t.ref}`;
    case 'unsupported': return `⚠ ${t.what}`;
    default: return t.kind;
  }
}

function wrap(t: TypeModel): string {
  const text = typeText(t);
  return t.kind === 'nullable' || t.kind === 'enum' ? `(${text})` : text;
}

function signature(fn: FunctionModel, sim: SimModel): string {
  const params = fn.params.map((p) => `${p.name}${p.optional ? '?' : ''}: ${typeText(p.type)}`).join(', ');
  const mws = fn.middlewares.map((m) => sim.middlewares[m]?.name ?? m);
  const extra = [
    mws.length > 0 ? `use ${mws.join(', ')}` : '',
    Object.keys(fn.options).length > 0 ? JSON.stringify(fn.options) : '',
  ].filter((s) => s !== '');
  return `\`${fn.verb} ${fn.name}(${params}): ${typeText(fn.result)}\`${extra.length > 0 ? ` — ${extra.join(' · ')}` : ''}`;
}

function field(f: FormField, indent: string): string[] {
  if ('group' in f) return [`${indent}- **${f.name}** (group)`, ...f.group.flatMap((g) => field(g, `${indent}  `))];
  const validators = f.validators.map((v) => (v.args.length > 0 ? `${v.name}(${v.args.map((a) => JSON.stringify(a)).join(', ')})` : v.name));
  return [`${indent}- **${f.name}**: \`${f.control}\` → \`${typeText(f.type)}\`, initial \`${JSON.stringify(f.initial ?? null)}\`${validators.length > 0 ? `, ${validators.join(', ')}` : ''}`];
}

export function report(sim: SimModel): string {
  const lines = [`# ${sim.sim}`, '', `Files reached: ${sim.files.map((f) => `\`${f}\``).join(', ')}`, ''];
  for (const c of sim.contracts) {
    lines.push(`## ${c.kind} \`${c.interface}\` — \`${c.file}\` (from \`${c.fud}\`)`, '');
    for (const fn of c.functions) lines.push(`- ${signature(fn, sim)}`);
    lines.push('');
  }
  const types = Object.entries(sim.types);
  if (types.length > 0) {
    lines.push('## Types', '');
    for (const [ref, t] of types) lines.push(`- \`${t.name}\` (\`${ref}\`): \`${typeText(t.type)}\``);
    lines.push('');
  }
  const mws = Object.entries(sim.middlewares);
  if (mws.length > 0) {
    lines.push('## Middlewares', '');
    for (const [ref, m] of mws) lines.push(`- \`${m.name}\` (\`${ref}\`): adds \`${m.adds === null ? 'nothing' : typeText(m.adds)}\`, client half: ${m.client ? 'yes' : 'no'}`);
    lines.push('');
  }
  for (const [ref, f] of Object.entries(sim.forms)) {
    lines.push(`## Form \`${f.name}\` (\`${ref}\`)`, '', ...f.fields.flatMap((x) => field(x, '')), '', `catches: ${JSON.stringify(f.catches)}`, '');
  }
  lines.push('## Issues', '');
  if (sim.issues.length === 0) lines.push('None.');
  for (const i of sim.issues) lines.push(`- **${i.severity}** \`${i.code}\` ${i.file}:${String(i.line)}:${String(i.col)} — ${i.message}`);
  lines.push('');
  return lines.join('\n');
}

export function summary(sims: readonly SimModel[]): string {
  const lines = [
    '# Contract AST — summary',
    '',
    '| Simulation | Contracts | Functions | Types | Forms | Errors | Notes |',
    '|---|---|---|---|---|---|---|',
  ];
  const codes = new Map<string, number>();
  for (const s of sims) {
    const errors = s.issues.filter((i) => i.severity === 'error').length;
    const fns = s.contracts.reduce((n, c) => n + c.functions.length, 0);
    lines.push(`| [${s.sim}](./${s.sim}/report.md) | ${String(s.contracts.length)} | ${String(fns)} | ${String(Object.keys(s.types).length)} | ${String(Object.keys(s.forms).length)} | ${String(errors)} | ${String(s.issues.length - errors)} |`);
    for (const i of s.issues) codes.set(`${i.severity} \`${i.code}\``, (codes.get(`${i.severity} \`${i.code}\``) ?? 0) + 1);
  }
  lines.push('', '## Issues by code', '');
  for (const [code, n] of [...codes].sort((a, b) => b[1] - a[1])) lines.push(`- ${code}: ${String(n)}`);
  lines.push('');
  return lines.join('\n');
}
