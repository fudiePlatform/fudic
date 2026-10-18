// The page the component lives in. The workbench mounts the component alone and never navigates:
// the line documents where it is used, and the evidence says it was not opened.
export const meta = {
  name: 'route',
  block: 'given',
  params: [{ name: 'path', type: 'token' }],
  describe: ({ path }) => `the component lives in ${path}`,
};

export async function run(_ctx, { path }) {
  return { pass: true, evidence: `mounted alone, not at ${path}` };
}

export const selfTest = [{ args: { path: '/' }, expect: 'pass' }];
