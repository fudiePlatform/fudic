/**
 * The server's `instructions`, which the client puts in its system prompt. A line that names a
 * tool is only there when the tool is: an instruction to call what does not exist sends the model
 * looking for it.
 */

const LINES: readonly { readonly needs?: readonly string[]; readonly text: string }[] = [
  {
    text: 'fudic is a UI framework you have no prior knowledge of. Never write fudic code from memory or by analogy with React, Vue or any other framework.',
  },
  { needs: ['fudic_status'], text: 'For any fudic task, the first call is fudic_status. Its "next" is the next step of building the project: follow it when the user asked you to build, not when they asked for something else.' },
  { text: 'Before writing a kind of file for the first time, call fudic_guide for its topic. Start with fudic_guide { topic: "overview" }.' },
  { needs: ['fudic_generate'], text: 'Create files with fudic_generate, never from scratch.' },
  { needs: ['fudic_check'], text: 'After every write, run fudic_check and fix every diagnostic before moving on.' },
  {
    needs: ['fudic_record'],
    text: 'Never approve on the user\'s behalf: fudic_record "approved" or "look" only after the user said so in this conversation.',
  },
  {
    needs: ['fudic_render', 'fudic_preview'],
    text: 'When the user wants to see something, use fudic_render for one piece and fudic_preview for the whole app. Seeing is not approving.',
  },
];

export function instructions(tools: ReadonlySet<string>): string {
  return LINES.filter((line) => (line.needs ?? []).every((name) => tools.has(name)))
    .map((line) => line.text)
    .join('\n');
}

/** The text of the `new-app` prompt: what a user who picks it from the chat's menu is asking for. */
export function newAppPrompt(tools: ReadonlySet<string>): string {
  const start = tools.has('fudic_status')
    ? 'Start with fudic_status and do what it says.'
    : 'Start by reading fudic_guide { topic: "overview" } and { topic: "workflow" }.';
  return `I want to create a fudic app or library from this conversation. ${start} Ask me only what you need: what it is for, its pages or components, and the data each one shows.`;
}
