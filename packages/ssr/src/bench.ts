/**
 * The services of a criterion of the workbench, in a page's root container (SDD-82 §4.2).
 *
 * The bench puts its hooks on `globalThis[Symbol.for('fudic.bench')]`; dev's route wrapper hands
 * each request's root through here, and a request that carries a criterion's cookie resolves the
 * criterion's services. Without hooks, or without a criterion, the root is left as it is. Read by
 * shape: the bench is not a dependency of this package.
 */

import { provideIn, type Container, type Provider } from '@fudic/di';

/** What this side reads of the bench's hooks. */
interface Hooks {
  criterionOf(request: Request): string | undefined;
  services(criterion: string): readonly { readonly provide: Provider<unknown>; readonly use: () => unknown }[];
}

/** `root` with the services of the criterion `request` belongs to, if any. */
export function benchRoot<C extends Container>(root: C, request: Request | undefined): C {
  const hooks = (globalThis as { [key: symbol]: Hooks | undefined })[Symbol.for('fudic.bench')];
  const criterion = hooks === undefined || request === undefined ? undefined : hooks.criterionOf(request);
  if (criterion !== undefined) for (const { provide, use } of hooks!.services(criterion)) provideIn(root, provide, use);
  return root;
}
