/**
 * What the server remembers of one MCP session, and only of it: the topics of the guide it has
 * served. It is the only state the server keeps, and it dies with the session.
 */

export class Session {
  readonly #read = new Set<string>();

  /** A topic of the guide was served in this session. */
  read(topic: string): void {
    this.#read.add(topic);
  }

  /** Whether a topic of the guide was served in this session. */
  has(topic: string): boolean {
    return this.#read.has(topic);
  }
}
