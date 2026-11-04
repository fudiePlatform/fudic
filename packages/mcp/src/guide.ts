/**
 * The guide: one markdown file per topic, published with the package, and every fudic code as a
 * topic of its own, read from the diagnostics catalogue.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FUD1403, type FudDiagnostic } from '@fudic/diagnostics';
import { explain } from '@fudic/diagnostics/explain';

export const TOPICS = ['overview', 'workflow', 'components', 'pages', 'view', 'fudapi', 'fudspec', 'testing', 'html-css'] as const;

export type Topic = (typeof TOPICS)[number];

/** `guide/` sits beside `src/` in the workspace and beside `dist/` once built. */
export function guideDir(from: string = import.meta.url): string {
  return fileURLToPath(new URL('../guide/', from));
}

/** What a guide answer carries besides the common fields. */
export interface GuidePage {
  readonly topic: string;
  /** The topics that say more about it. */
  readonly related: readonly string[];
  readonly body: string;
  /** For a code: its parts, as the catalogue splits them. */
  readonly title?: string;
  readonly severity?: string;
  readonly why?: string;
  readonly fix?: string;
  readonly replacedBy?: string;
}

export type GuideResult = { readonly page: GuidePage } | { readonly error: FudDiagnostic };

const isTopic = (topic: string): topic is Topic => (TOPICS as readonly string[]).includes(topic);

export class Guide {
  readonly #dir: string;
  readonly #bodies = new Map<Topic, string>();

  constructor(dir: string = guideDir()) {
    this.#dir = dir;
  }

  #body(topic: Topic): string {
    let body = this.#bodies.get(topic);
    if (body === undefined) {
      body = readFileSync(`${this.#dir}${topic}.md`, 'utf8').replace(/\r\n/gu, '\n');
      this.#bodies.set(topic, body);
    }
    return body;
  }

  /** The topics whose text names `word`, in the order of the list. */
  #naming(word: string, except?: Topic): readonly Topic[] {
    return TOPICS.filter((t) => t !== except && this.#body(t).includes(word));
  }

  read(asked: string): GuideResult {
    const topic = asked.trim();
    const lower = topic.toLowerCase();
    if (isTopic(lower)) {
      const body = this.#body(lower);
      return { page: { topic: lower, related: TOPICS.filter((t) => t !== lower && body.includes(`\`${t}\``)), body } };
    }
    const code = topic.toUpperCase();
    if (/^TS\d+$/u.test(code)) {
      return {
        page: {
          topic: code,
          related: [],
          body: `${code} is a TypeScript error, not a fudic one: it has no explanation of its own. Its message says what is wrong, and its position is already in the .fud file.`,
        },
      };
    }
    const explained = /^FUD\d{4}$/u.test(code) ? explain(code) : undefined;
    if (explained === undefined) return { error: FUD1403({ topic, topics: TOPICS }) };
    const closing = explained.fix !== undefined ? `**Fix:** ${explained.fix}` : `**Replaced by:** ${explained.replacedBy ?? ''}`;
    return {
      page: {
        topic: code,
        related: this.#naming(code),
        body: `# ${code} — ${explained.title}\n**${explained.severity}**\n\n${explained.why}\n\n${closing}\n`,
        title: explained.title,
        severity: explained.severity,
        why: explained.why,
        ...(explained.fix !== undefined ? { fix: explained.fix } : {}),
        ...(explained.replacedBy !== undefined ? { replacedBy: explained.replacedBy } : {}),
      },
    };
  }
}
