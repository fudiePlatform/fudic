import { computed, signal } from "@fudic/core";

export const items = signal<readonly string[]>([]);
export const count = computed(() => items().length);

export function add(name: string): void {
  items.set([...items(), name]);
}
