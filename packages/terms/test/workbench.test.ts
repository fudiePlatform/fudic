/**
 * SDD-59 §6.3.3: `@fudic/terms` uses only what the workbench makes public, `BenchExtension` and
 * `TermHost`. The checks are the types themselves: `pnpm typecheck` fails if they drift apart.
 */

import type { BenchExtension as WorkbenchExtension, TermHost as WorkbenchHost } from '@fudic/workbench';
import { describe, expectTypeOf, it } from 'vitest';
import { defineExtension, stock, type BenchExtension, type TermContext, type TermHost } from '../src/index.js';

describe('the runtime fits the workbench', () => {
  it('the stock extension is an extension the workbench accepts', () => {
    expectTypeOf(stock).toExtend<WorkbenchExtension>();
  });

  it('an extension written with defineExtension, that adds to the ctx, is one too', () => {
    const user = defineExtension({
      setup: async () => undefined,
      context: (ctx: TermContext) => ({ ...ctx, openMenu: async (_ref: string) => undefined }),
    });
    expectTypeOf(user).toExtend<WorkbenchExtension>();
    expectTypeOf(user).toExtend<BenchExtension>();
  });

  it('the host the workbench gives is the host the runtime takes, both ways', () => {
    expectTypeOf<WorkbenchHost>().toExtend<TermHost>();
    expectTypeOf<TermHost>().toExtend<WorkbenchHost>();
  });
});
