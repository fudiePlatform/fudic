import { describe, expect, it, vi } from 'vitest';
import { batch, computed, effect, owned, signal, untrack } from '../src/index.js';
import { type LeafSource, report } from '../src/tracking.js';

describe('effect (SDD-31 §6.6–§6.10)', () => {
  it('runs once on creation and once per change of what it read', () => {
    const a = signal(1);
    const seen: number[] = [];
    effect(() => {
      seen.push(a());
    });
    expect(seen).toEqual([1]);
    a.set(2);
    a.set(2); // filtered by Object.is: no notification, no run
    a.set(3);
    expect(seen).toEqual([1, 2, 3]);
  });

  it('subscribes to the leaves behind a derived value, not to the derived value', () => {
    const a = signal(1);
    const double = computed(() => a() * 2);
    const seen: number[] = [];
    effect(() => {
      seen.push(double());
    });
    a.set(4);
    expect(seen).toEqual([2, 8]);
  });

  it('recomputes its dependencies on every run', () => {
    const flag = signal(true);
    const x = signal('x1');
    const y = signal('y1');
    const seen: string[] = [];
    effect(() => {
      seen.push(flag() ? x() : y());
    });
    expect(seen).toEqual(['x1']);

    y.set('y2'); // not a dependency yet
    expect(seen).toEqual(['x1']);

    flag.set(false);
    expect(seen).toEqual(['x1', 'y2']);

    x.set('x2'); // no longer a dependency
    expect(seen).toEqual(['x1', 'y2']);

    y.set('y3');
    expect(seen).toEqual(['x1', 'y2', 'y3']);
  });

  it('the disposer cuts every subscription and is idempotent', () => {
    const a = signal(1);
    const fn = vi.fn(() => void a());
    const off = effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    off();
    a.set(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('an effect disposed mid-flush does not run', () => {
    const a = signal(0);
    const seen: number[] = [];
    let off = (): void => {};
    effect(() => {
      a();
      off();
    });
    off = effect(() => {
      seen.push(a());
    });
    seen.length = 0;
    // Both are queued by the batch; the first one disposes the second before
    // the flush reaches it.
    batch(() => {
      a.set(1);
    });
    expect(seen).toEqual([]);
  });

  it('untrack inside the body suppresses the dependency', () => {
    const a = signal(1);
    const b = signal(10);
    const seen: number[] = [];
    effect(() => {
      seen.push(a() + untrack(() => b()));
    });
    b.set(20);
    expect(seen).toEqual([11]);
    a.set(2);
    expect(seen).toEqual([11, 22]);
  });

  it('feedback throws after a bounded number of chained runs', () => {
    const a = signal(0);
    effect(() => {
      a.set(a() + 1);
    });
    expect(() => a.set(100)).toThrow(/feedback loop/);
  });
});

describe('effect cleanup (SDD-31 §6.21)', () => {
  it('runs before the next run and once on dispose', () => {
    const a = signal(1);
    const log: string[] = [];
    const off = effect(() => {
      const v = a();
      log.push(`up:${v}`);
      return () => log.push(`down:${v}`);
    });
    a.set(2);
    a.set(3);
    off();
    off();
    expect(log).toEqual(['up:1', 'down:1', 'up:2', 'down:2', 'up:3', 'down:3']);
  });

  it('a listener effect ends with exactly one alive, and none after dispose', () => {
    const a = signal(1);
    const alive = new Set<() => void>();
    const off = effect(() => {
      a();
      const handler = (): void => {};
      alive.add(handler);
      return () => alive.delete(handler);
    });
    a.set(2);
    a.set(3);
    expect(alive.size).toBe(1);
    off();
    expect(alive.size).toBe(0);
  });

  it('the cleanup does not track what it reads', () => {
    const a = signal(1);
    const b = signal(10);
    let runs = 0;
    effect(() => {
      runs += 1;
      a();
      return () => void b();
    });
    a.set(2);
    expect(runs).toBe(2);
    b.set(20); // read only by the cleanup, so it is nobody's dependency
    expect(runs).toBe(2);
  });
});

describe('batch (SDD-31 §6.11–§6.13)', () => {
  it('without it, two writes are two runs and the first sees the old value', () => {
    const a = signal(0);
    const b = signal(0);
    const seen: string[] = [];
    effect(() => {
      seen.push(`${a()}/${b()}`);
    });
    a.set(1);
    b.set(2);
    expect(seen).toEqual(['0/0', '1/0', '1/2']);
  });

  it('with it, two writes are one run and it sees both new values', () => {
    const a = signal(0);
    const b = signal(0);
    const seen: string[] = [];
    effect(() => {
      seen.push(`${a()}/${b()}`);
    });
    batch(() => {
      a.set(1);
      b.set(2);
    });
    expect(seen).toEqual(['0/0', '1/2']);
  });

  it('a read inside the batch already sees the new value', () => {
    const a = signal(1);
    const inside = batch(() => {
      a.set(5);
      return a();
    });
    expect(inside).toBe(5);
  });

  it('returns what fn returns', () => {
    expect(batch(() => 'done')).toBe('done');
  });

  it('nesting does not nest flushes: only the outermost one delivers', () => {
    const a = signal(0);
    const b = signal(0);
    const seen: string[] = [];
    effect(() => {
      seen.push(`${a()}/${b()}`);
    });
    batch(() => {
      batch(() => {
        a.set(1);
      });
      expect(seen).toEqual(['0/0']); // the inner batch delivered nothing
      b.set(2);
    });
    expect(seen).toEqual(['0/0', '1/2']);
  });

  it('flushes even if fn throws', () => {
    const a = signal(0);
    const seen: number[] = [];
    effect(() => {
      seen.push(a());
    });
    expect(() =>
      batch(() => {
        a.set(1);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(seen).toEqual([0, 1]);
  });
});

/**
 * A leaf that counts its subscribers, so "nothing survives the disposer" is a number
 * and not an inference. `read` is a tracked read; `notify` is a write.
 */
function probe(): { read: () => void; notify: () => void; live: () => number } {
  const subscribers = new Set<() => void>();
  const leaf: LeafSource = {
    version: () => 0,
    collectLeaves: (out) => {
      out.add(leaf);
    },
    subscribe: (fn) => {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
  };
  return {
    read: () => {
      report(leaf);
    },
    notify: () => {
      for (const fn of [...subscribers]) fn();
    },
    live: () => subscribers.size,
  };
}

describe('a run that is no longer the current one (SDD-76 §4.4)', () => {
  it('an effect disposed by its own body keeps no subscription and runs every cleanup (criterion 1)', () => {
    const p = probe();
    let cleanups = 0;
    let runs = 0;
    let selfStop = false;
    const stop: () => void = effect(() => {
      runs += 1;
      p.read();
      if (selfStop) stop();
      return () => {
        cleanups += 1;
      };
    });
    selfStop = true;
    p.notify();
    expect(p.live()).toBe(0);
    expect(cleanups).toBe(2);
    p.notify();
    expect(runs).toBe(2);
  });

  it('disposed from outside while its body runs: the same (criterion 3)', () => {
    const p = probe();
    const trigger = signal(0);
    let cleanups = 0;
    let armed = false;
    let stopFirst = (): void => {};
    // A second effect, subscribed to what the first one writes, disposes the first —
    // the shape of a component torn down by a write its own effect made.
    effect(() => {
      if (trigger() > 0) stopFirst();
    });
    stopFirst = effect(() => {
      p.read();
      if (armed) trigger.set(1);
      return () => {
        cleanups += 1;
      };
    });
    armed = true;
    p.notify();
    expect(p.live()).toBe(0);
    expect(cleanups).toBe(2);
  });

  it('a re-entrant run that converges loses no cleanup (criterion 4)', () => {
    const a = signal(10);
    const made: number[] = [];
    const undone: number[] = [];
    const stop = effect(() => {
      const v = a();
      if (v < 2) a.set(v + 1);
      made.push(v);
      return () => undone.push(v);
    });
    a.set(0);
    expect(made).toEqual([10, 2, 1, 0]);
    expect(undone).toEqual([10, 1, 0]);
    stop();
    expect(undone).toEqual([10, 1, 0, 2]);
    a.set(5);
    expect(made).toEqual([10, 2, 1, 0]);
  });

  it('a superseded run with no cleanup has nothing to undo', () => {
    const a = signal(10);
    const seen: number[] = [];
    effect(() => {
      const v = a();
      if (v < 2) a.set(v + 1);
      seen.push(v);
    });
    a.set(1);
    expect(seen).toEqual([10, 2, 1]);
  });

  it('a first run that throws leaves nothing subscribed and nothing owned (criterion 6)', () => {
    const p = probe();
    const [, owned_] = owned(() => {
      expect(() =>
        effect(() => {
          p.read();
          throw new Error('boom');
        }),
      ).toThrow('boom');
    });
    expect(p.live()).toBe(0);
    expect(owned_).toEqual([]);
  });
});

describe('effect with declared dependencies (SDD-76 §4.2)', () => {
  it('an effect disposed by its own body: same as without deps (criterion 2)', () => {
    const p = probe();
    const dep = signal(0);
    let cleanups = 0;
    let selfStop = false;
    const stop: () => void = effect(() => {
      if (selfStop) stop();
      return () => {
        cleanups += 1;
      };
    }, [dep, p.read]);
    selfStop = true;
    dep.set(1);
    expect(p.live()).toBe(0);
    expect(cleanups).toBe(2);
  });

  it('a re-entrant run that converges loses no cleanup (criterion 5)', () => {
    const a = signal(10);
    const made: number[] = [];
    const undone: number[] = [];
    const stop = effect(() => {
      const v = a();
      if (v < 2) a.set(v + 1);
      made.push(v);
      return () => undone.push(v);
    }, [a]);
    a.set(0);
    expect(made).toEqual([10, 2, 1, 0]);
    expect(undone).toEqual([10, 1, 0]);
    stop();
    expect(undone).toEqual([10, 1, 0, 2]);
  });

  it('a run overtaken while reading its dependencies neither reconciles nor runs the body (§4.4)', () => {
    const a = signal(10);
    const seen: number[] = [];
    effect(() => {
      seen.push(untrack(a));
    }, [
      () => {
        const v = a();
        if (v < 2) a.set(v + 1);
        return v;
      },
    ]);
    a.set(0);
    expect(seen).toEqual([10, 2]);
  });

  it('a first run that throws, in a dependency or in the body, leaves nothing behind (criterion 6)', () => {
    const p = probe();
    const [, list] = owned(() => {
      expect(() =>
        effect(() => {}, [
          () => {
            p.read();
            throw new Error('boom');
          },
        ]),
      ).toThrow('boom');
      expect(() =>
        effect(() => {
          throw new Error('boom');
        }, [p.read]),
      ).toThrow('boom');
    });
    expect(p.live()).toBe(0);
    expect(list).toEqual([]);
  });

  it('only what is listed triggers it, and the body sees the rest current (criterion 7)', () => {
    const a = signal(1);
    const b = signal(10);
    const seen: string[] = [];
    effect(() => {
      seen.push(`${a()}/${b()}`);
    }, [a]);
    b.set(20);
    expect(seen).toEqual(['1/10']);
    a.set(2);
    expect(seen).toEqual(['1/10', '2/20']);
  });

  it('runs once, synchronously, on creation (criterion 8)', () => {
    const a = signal(1);
    let runs = 0;
    effect(() => {
      runs += 1;
    }, [a]);
    expect(runs).toBe(1);
  });

  it('[] runs once, subscribes to nothing, and cleans up only on dispose (criterion 9)', () => {
    const p = probe();
    let runs = 0;
    let cleanups = 0;
    const stop = effect(() => {
      runs += 1;
      p.read();
      return () => {
        cleanups += 1;
      };
    }, []);
    expect(runs).toBe(1);
    expect(p.live()).toBe(0);
    expect(cleanups).toBe(0);
    stop();
    expect(cleanups).toBe(1);
  });

  it('a computed that returns to the same value does not run the body (criterion 10)', () => {
    const a = signal(1);
    const b = signal(2);
    const total = computed(() => a() + b());
    const log: string[] = [];
    effect(() => {
      log.push(`up:${total()}`);
      return () => log.push('down');
    }, [total]);
    let tracked = 0;
    effect(() => {
      total();
      tracked += 1;
    });
    batch(() => {
      a.set(2);
      b.set(1);
    });
    expect(log).toEqual(['up:3']);
    // Without deps there is no cut at the derived boundary (SDD-31 §4.3): it runs.
    expect(tracked).toBe(2);
  });

  it('an arrow dependency cuts on what it returns (criterion 11)', () => {
    const user = signal({ id: 1, name: 'Ana' });
    let runs = 0;
    effect(() => {
      runs += 1;
    }, [() => user().id]);
    user.set({ id: 1, name: 'Luis' });
    expect(runs).toBe(1);
    user.set({ id: 2, name: 'Luis' });
    expect(runs).toBe(2);
  });

  it('a batch that moves a signal and puts it back does not run the body (criterion 12)', () => {
    const a = signal(1);
    let runs = 0;
    effect(() => {
      runs += 1;
    }, [a]);
    batch(() => {
      a.set(2);
      a.set(1);
    });
    expect(runs).toBe(1);
  });

  it('subscriptions follow a dependency with a branch even when its value holds (criterion 13)', () => {
    const flag = signal(true);
    const x = probe();
    const y = probe();
    let runs = 0;
    effect(() => {
      runs += 1;
    }, [
      flag,
      () => {
        if (flag()) x.read();
        else y.read();
        return 0;
      },
    ]);
    expect([x.live(), y.live()]).toEqual([1, 0]);
    flag.set(false);
    expect([x.live(), y.live()]).toEqual([0, 1]);
    expect(runs).toBe(2);
    y.notify(); // reruns the dependencies; neither value moved
    expect(runs).toBe(2);
    expect([x.live(), y.live()]).toEqual([0, 1]);
  });

  it('the array is copied when the effect is created (criterion 14)', () => {
    const a = signal(1);
    const b = signal(1);
    const deps = [a];
    let runs = 0;
    effect(() => {
      runs += 1;
    }, deps);
    deps.push(b);
    b.set(2);
    expect(runs).toBe(1);
  });

  it('a repeated dependency is one subscription and one run (criterion 15)', () => {
    const p = probe();
    let runs = 0;
    let n = 0;
    const read = (): number => {
      p.read();
      return n;
    };
    effect(() => {
      runs += 1;
    }, [read, read]);
    expect(p.live()).toBe(1);
    n = 1;
    p.notify();
    expect(runs).toBe(2);
  });

  it('a body that always writes its dependency is the same feedback loop, caught on creation (criterion 16)', () => {
    const p = probe();
    const a = signal(0);
    expect(() =>
      effect(() => {
        a.set(untrack(a) + 1);
      }, [a, p.read]),
    ).toThrow(/feedback loop/);
    expect(p.live()).toBe(0);
  });

  it('neither the body nor the cleanup tracks what it reads (criterion 17)', () => {
    const a = signal(1);
    const inBody = probe();
    const inCleanup = probe();
    effect(() => {
      inBody.read();
      return () => inCleanup.read();
    }, [a]);
    a.set(2);
    expect(inBody.live()).toBe(0);
    expect(inCleanup.live()).toBe(0);
  });

  it('a dependency that throws on a later run leaves the previous run in place (criterion 18)', () => {
    const a = signal(1);
    const log: string[] = [];
    const stop = effect(() => {
      log.push(`up:${untrack(a)}`);
      return () => log.push('down');
    }, [
      () => {
        if (a() === 2) throw new Error('boom');
        return a();
      },
    ]);
    expect(() => a.set(2)).toThrow('boom');
    expect(log).toEqual(['up:1']);
    // The previous subscription is still live, and the previous cleanup still pending.
    a.set(3);
    expect(log).toEqual(['up:1', 'down', 'up:3']);
    stop();
    expect(log).toEqual(['up:1', 'down', 'up:3', 'down']);
    a.set(4);
    expect(log).toHaveLength(4);
  });

  it('a body that throws on a later run leaves no cleanup and this run subscribed (criterion 18)', () => {
    const a = signal(1);
    const b = probe();
    const log: string[] = [];
    const stop = effect(() => {
      const v = untrack(a);
      if (v === 2) throw new Error('boom');
      log.push(`up:${v}`);
      return () => log.push('down');
    }, [
      a,
      () => {
        if (a() === 2) b.read();
        return 0;
      },
    ]);
    expect(() => a.set(2)).toThrow('boom');
    expect(log).toEqual(['up:1', 'down']);
    expect(b.live()).toBe(1);
    stop();
    expect(log).toEqual(['up:1', 'down']);
    expect(b.live()).toBe(0);
  });

  it('created inside owned, the owner tears it down (criterion 19)', () => {
    const p = probe();
    let cleanups = 0;
    const [, list] = owned(() => {
      effect(() => {
        return () => {
          cleanups += 1;
        };
      }, [p.read]);
    });
    expect(p.live()).toBe(1);
    for (const dispose of list) dispose();
    expect(p.live()).toBe(0);
    expect(cleanups).toBe(1);
  });

  it('a dependency is a function, not a value (criterion 20)', () => {
    const count = signal(1);
    const total = computed(() => count() * 2);
    const user = signal({ id: 1 });
    // @ts-expect-error -- `count()` is a number: the React habit, caught by the type.
    expect(() => effect(() => {}, [count()])).toThrow(TypeError);
    expect(() => effect(() => {}, [count, total, () => user().id])).not.toThrow();
  });
});
