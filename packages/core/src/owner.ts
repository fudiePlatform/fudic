let current: (() => void)[] | null = null;

/**
 * Runs `fn` and returns its result with the teardowns of every `effect` and `task` it
 * created. The compiled component calls these when it is removed.
 */
export function owned<T>(fn: () => T): readonly [T, readonly (() => void)[]] {
  const previous = current;
  const list: (() => void)[] = [];
  current = list;
  try {
    return [fn(), list];
  } finally {
    current = previous;
  }
}

/** Hands `dispose` to the running `owned`, if any. */
export function own(dispose: () => void): void {
  current?.push(dispose);
}
