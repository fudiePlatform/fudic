// Chooses a file, written relative to the `.fudspec`: in the `<input type="file">` itself, or in
// the file chooser that clicking the element opens (a button, a label, a drop zone).
export const meta = {
  name: 'upload',
  block: 'when',
  params: [
    { name: 'target', type: 'element' },
    { name: 'file', type: 'string' },
  ],
  describe: ({ target, file }) => `the user chooses ${file} in ${target}`,
};

// Runs in the page, so it travels as source text.
const IS_FILE_INPUT = new Function('element', "return element instanceof HTMLInputElement && element.type === 'file';");

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target, file }) {
  const path = ctx.resolve(String(file));
  const element = ctx.locate(String(target));
  if (await element.evaluate(IS_FILE_INPUT)) {
    await ctx.act(element, () => element.setInputFiles(path));
  } else {
    await ctx.act(element, async () => {
      const [chooser] = await Promise.all([ctx.page.waitForEvent('filechooser'), element.click()]);
      await chooser.setFiles(path);
    });
  }
  return { pass: true, evidence: `chose ${file}` };
}
