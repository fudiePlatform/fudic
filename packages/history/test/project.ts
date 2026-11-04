/**
 * A throwaway fudic project for the tests that really run tests and criteria. It lives under
 * `test/.tmp/` — inside the package, so `@fudic/core`, `@fudic/testing` and `@fudic/terms` resolve
 * from this package's devDependencies — and out of git.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toPosix } from '@fudic/typecheck';

const TMP = toPosix(fileURLToPath(new URL('./.tmp', import.meta.url)));

export interface Project {
  readonly root: string;
  write(relative: string, content: string): void;
  read(relative: string): string;
  remove(): void;
}

let count = 0;

export const UNIT = 'src/components/acme-button/acme-button.fud';
export const SPEC = 'src/components/acme-button/acme-button.fudspec';
export const TEST = 'src/components/acme-button/acme-button.test.ts';
export const LOG = 'src/components/acme-button/acme-button.fudlog';

export const BUTTON = `@code {
  import { signal } from "@fudic/core";

  const { start = 0 } = props<{ start?: number }>();

  const n = signal(start);

  function inc() {
    n.set(n() + 1);
  }
}

<acme-button>
  <template shadowrootmode="open">
    <button @click=@inc>+</button>
    <output role="status">@n()</output>
  </template>
</acme-button>
`;

/** Six green tests of the button. */
export const GREEN = `import { describe, expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as Button from './acme-button.fud';

describe('acme-button', () => {
  test('starts at zero', async () => {
    const t = await mount(Button);
    expect(t.getByRole('status')).toHaveTextContent('0');
  });
  test('starts where it is told', async () => {
    const t = await mount(Button, { props: { start: 4 } });
    expect(t.getByRole('status')).toHaveTextContent('4');
  });
  test('adds one on click', async () => {
    const t = await mount(Button);
    await t.click(t.getByRole('button', { name: '+' }));
    expect(t.getByRole('status')).toHaveTextContent('1');
  });
  test('adds two on two clicks', async () => {
    const t = await mount(Button);
    await t.click(t.getByRole('button', { name: '+' }));
    await t.click(t.getByRole('button', { name: '+' }));
    expect(t.getByRole('status')).toHaveTextContent('2');
  });
  test('has one button', async () => {
    const t = await mount(Button);
    expect(t.root.querySelectorAll('button')).toHaveLength(1);
  });
  test('has one status', async () => {
    const t = await mount(Button);
    expect(t.root.querySelectorAll('output')).toHaveLength(1);
  });
});
`;

/** Six new tests of phase 3, every one red of an assertion. */
export const RED = `import { describe, expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as Button from './acme-button.fud';

describe('acme-button', () => {
  for (const n of [1, 2, 3, 4, 5, 6]) {
    test(\`not built yet \${n}\`, async () => {
      const t = await mount(Button);
      expect(t.getByRole('status')).toHaveTextContent(\`danger \${n}\`);
    });
  }
});
`;

/** A test file that does not load. */
export const BROKEN = `import { test } from 'vitest';
import { nothing } from './not-there.js';

test('never runs', () => {
  nothing();
});
`;

/** Four criteria, one red: `cuenta-dos` expects what one click gives. */
export const CRITERIA = `component acme-button

criterion empieza-en-cero
  then
    text role:status "0"

criterion suma-uno
  when
    click role:button/"+"
  then
    text role:status "1"

criterion tiene-boton
  then
    visible role:button/"+"

criterion cuenta-dos
  when
    click role:button/"+"
  then
    text role:status "2"
`;

export function project(name: string): Project {
  count += 1;
  const root = `${TMP}/${name}-${process.pid}-${count}`;
  rmSync(root, { recursive: true, force: true });
  const path = (relative: string): string => `${root}/${relative}`;
  const write = (relative: string, content: string): void => {
    mkdirSync(dirname(path(relative)), { recursive: true });
    writeFileSync(path(relative), content);
  };
  write('package.json', JSON.stringify({ name: `history-${name}`, private: true, type: 'module' }));
  write('fudic.json', JSON.stringify({ id: `history-${name}`, kind: 'app', prefix: 'acme' }));
  write(
    'vitest.config.ts',
    "import { defineConfig } from 'vitest/config';\nimport { fudicTest } from '@fudic/testing/config';\n\n" +
      "export default defineConfig({ plugins: [fudicTest()], test: { include: ['src/**/*.test.ts'] } });\n",
  );
  write(UNIT, BUTTON);
  write(SPEC, CRITERIA);
  write(TEST, GREEN);
  return {
    root,
    write,
    read: (relative) => readFileSync(path(relative), 'utf8'),
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}
