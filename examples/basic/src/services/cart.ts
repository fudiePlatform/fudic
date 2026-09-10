import { inject, Service, token } from '@fudic/di';

/**
 * The value the server publishes so the browser can build the same cart from it.
 *
 * What crosses the wire is this array, never a `Cart`: instances do not travel, values do.
 * The name is the key of the `fud-di` block, so it has to be unique on the route.
 */
export const LINES = token<readonly string[]>('lines');

/**
 * A root service: `Service` registers it in the root registry the moment this module loads,
 * so every container of the page resolves it to the SAME instance — the counter in `id` is
 * what the page shows to prove it.
 *
 * Written as a call and not as `@Service` because no transform in the toolchain lowers
 * standard decorators yet. It is the same function either way.
 */
export class Logger {
  static count = 0;
  readonly id = `Logger#${++Logger.count}`;
  readonly entries: string[] = [];

  log(message: string): void {
    this.entries.push(message);
  }
}
Service(Logger);

/**
 * NOT a `@Service`: `di-owner` provides it, so the instance belongs to that ancestor and its
 * subtree, and asking for it from the root would find nothing.
 *
 * Both fields inject from the AMBIENT container, which exists because this constructor runs
 * inside the factory the injector is executing — the one place a bare `inject()` is legal.
 */
export class Cart {
  static count = 0;
  readonly id = `Cart#${++Cart.count}`;
  readonly log = inject(Logger);
  readonly lines: string[] = [...(inject(LINES, { optional: true }) ?? [])];

  add(line: string): void {
    this.lines.push(line);
    this.log.log(`${this.id} add ${line}`);
  }
}
