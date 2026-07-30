/**
 * Runs an action at most once (SDD-25 §4.1: "with a warning, once only").
 *
 * It lives in its own module because the "once" has to survive a server restart: the same
 * guard is handed to activation and to the supervisor, so three crashes in a row do not
 * produce three identical warnings. Module-level state would do the same thing and be
 * untestable and shared between workspaces, which §5 forbids.
 */
export interface Once {
  (action: () => void): void;
}

export const createOnce = (): Once => {
  let used = false;
  return (action) => {
    if (used) return;
    used = true;
    action();
  };
};
