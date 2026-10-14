/**
 * `attachInternals`, which happy-dom does not have: without it a form-associated component
 * cannot even be constructed.
 *
 * A stand-in, not a simulation (§5). What `ElementInternals` does in a browser — a value in an
 * outer `FormData`, a real `:invalid`, an outside `<label>` reaching in — is the browser's, and
 * it is tested with a `.fudspec`. Here it keeps what it is told, so `validity` answers with the
 * flags it was last given, and it has no labels.
 */

/** The flags of a `ValidityState`, all clear. */
const CLEAR = {
  badInput: false,
  customError: false,
  patternMismatch: false,
  rangeOverflow: false,
  rangeUnderflow: false,
  stepMismatch: false,
  tooLong: false,
  tooShort: false,
  typeMismatch: false,
  valueMissing: false,
};

/** An `ElementInternals` that keeps the form value and the validity it is handed. */
class StandInInternals {
  value: unknown = null;
  validity: ValidityState = { ...CLEAR, valid: true };
  validationMessage = '';
  readonly labels: readonly HTMLLabelElement[] = [];

  setFormValue(value: unknown): void {
    this.value = value;
  }

  setValidity(flags: ValidityStateFlags, message = ''): void {
    const set = { ...CLEAR, ...flags };
    this.validity = { ...set, valid: !Object.values(set).some(Boolean) };
    this.validationMessage = message;
  }
}

/**
 * Give every element an `attachInternals`. Installed whole, with no feature test: the happy-dom
 * the harness pins (see `upgrade.ts`) has none, and the upgrade fails loudly on another one.
 */
export function installInternals(): void {
  HTMLElement.prototype.attachInternals = function attachInternals(): ElementInternals {
    return new StandInInternals() as unknown as ElementInternals;
  };
}
