// The element has the focus, wherever it is: the focus is followed into every shadow root.
export const meta = {
  name: 'focused',
  block: 'then',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `${target} has the focus`,
};

// Runs in the page, so it travels as source text: whether the deepest focused element is this
// one, and which element that is.
const FOCUSED = new Function(
  'element',
  `let active = document.activeElement;
  while (active && active.shadowRoot && active.shadowRoot.activeElement) active = active.shadowRoot.activeElement;
  const holder = active === null || active === document.body ? 'nothing' : active.localName;
  return { focused: active === element, holder };`,
);

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target }) {
  const element = ctx.locate(String(target));
  // An element that is not there has no focus: a fail, not a wait.
  if ((await element.count()) === 0) return { pass: false, evidence: 'not there' };
  const { focused, holder } = await element.evaluate(FOCUSED);
  return { pass: focused, evidence: focused ? 'focused' : `the focus is on ${holder}` };
}
