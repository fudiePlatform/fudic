/**
 * Downloads chunks ahead of a gesture without evaluating them: no component code runs and
 * nothing is defined. Through the Service Worker when one controls the page, through
 * `<link rel="modulepreload">` otherwise.
 */
export interface WarmChannel {
  /** Downloads these chunks. `urls` and `tags` are parallel arrays. */
  warm(urls: readonly string[], tags: readonly string[]): void;
}

/** Dispatched on the document when a tag's chunk is downloaded. */
export const WARMED_EVENT = 'fud:warmed';

export interface WarmedDetail {
  readonly tag: string;
}

export function announceWarmed(doc: Document, tag: string): void {
  const detail: WarmedDetail = { tag };
  doc.dispatchEvent(new CustomEvent(WARMED_EVENT, { detail }));
}

/** For a page that downloads nothing ahead of time. */
export const nullWarmChannel: WarmChannel = {
  warm(): void {
    // Intentionally empty.
  },
};
