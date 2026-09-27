/**
 * The relay: what names and describes a control-component's HOST, carried to its FIELD — the
 * element of its shadow root that holds `control=` (BUG-42 §4.8).
 *
 * Nothing that points by id crosses a shadow boundary. Two standards cover the gap between
 * them, and this module is where they meet:
 *
 * - **Reference Target** forwards to the field what points AT the host: a `<label for>`, another
 *   element's `aria-labelledby`. The component's author writes it; where a browser has it, the
 *   labels need nothing from here.
 * - **Element reflection** (`ariaLabelledByElements`, `ariaDescribedByElements`) lets an element
 *   of a shadow root reference elements of the trees around it. That is how what is written ON
 *   the host — `aria-describedby` of an outside marker, `aria-labelledby`, `aria-label` — reaches
 *   the field, bridge or no bridge, because the bridge does not forward those. And it is how the
 *   host's labels (`internals.labels`) reach the field where there is no bridge.
 *
 * It REFERENCES and never copies: a name stays alive when its text changes, includes a
 * wrapper's shadow content, and leaves the `*` in `aria-hidden` out.
 *
 * It MERGES with what the field says of itself: the field's own description goes first, and a
 * field with a name of its own (an inner `<label>`) is not given a second one.
 */

/** What the field said of itself before the relay first touched it. */
interface Own {
  readonly describedBy: string | null;
  readonly labelledBy: string | null;
  readonly label: string | null;
}

/** The field's own attributes, read once: after the relay writes, the attributes are its. */
const owns = new WeakMap<Element, Own>();

/** The two reflected lists, as the relay writes them. Not in every `lib` yet. */
interface Reflecting {
  ariaDescribedByElements: readonly Element[] | null;
  ariaLabelledByElements: readonly Element[] | null;
}

function ownOf(field: HTMLElement): Own {
  let own = owns.get(field);
  if (own === undefined) {
    own = {
      describedBy: field.getAttribute('aria-describedby'),
      labelledBy: field.getAttribute('aria-labelledby'),
      label: field.getAttribute('aria-label'),
    };
    owns.set(field, own);
  }
  return own;
}

/** The elements an IDREF list names, looked up in the tree `from` lives in. */
function resolve(from: Element, ids: string | null): Element[] {
  const root = from.getRootNode() as Document | ShadowRoot;
  return (ids ?? '')
    .split(/\s+/u)
    .filter((id) => id !== '')
    .map((id) => root.getElementById(id))
    .filter((el): el is HTMLElement => el !== null);
}

/** Whether the field is named from inside its own shadow root. */
function named(field: HTMLElement, own: Own): boolean {
  const labels = (field as Partial<HTMLInputElement>).labels;
  return own.label !== null || own.labelledBy !== null || (labels?.length ?? 0) > 0;
}

/**
 * Carries to `field` what `host` says. `labels` are the host's own labels when there is no
 * native bridge to forward them, and `null` when there is one.
 */
export function relay(host: HTMLElement, field: HTMLElement, labels: readonly Element[] | null): void {
  const own = ownOf(field);
  const hasName = named(field, own);
  const reflect = field as unknown as Reflecting;

  const described = [...resolve(field, own.describedBy), ...resolve(host, host.getAttribute('aria-describedby'))];
  reflect.ariaDescribedByElements = described.length > 0 ? described : null;

  const labelled = [
    ...resolve(field, own.labelledBy),
    ...resolve(host, host.getAttribute('aria-labelledby')),
    ...(hasName || labels === null ? [] : labels),
  ];
  reflect.ariaLabelledByElements = labelled.length > 0 ? labelled : null;

  const label = hasName ? own.label : host.getAttribute('aria-label');
  if (label === null) field.removeAttribute('aria-label');
  else field.setAttribute('aria-label', label);
}

/** The host attributes whose change moves what the relay carries. */
export const RELAYED = ['id', 'aria-label', 'aria-labelledby', 'aria-describedby'] as const;
