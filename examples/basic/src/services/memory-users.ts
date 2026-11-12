import { notFound } from '@fudic/http';
import type { Person } from '../data/people';
import { Users } from './users';

/**
 * `Users` over a list of its own, for a flow of the workbench (`src/flows/*.fixture.ts`): each
 * criterion gets a new one, so what one criterion creates no other sees, and the people table of
 * the running app is never touched.
 */
export class MemoryUsers extends Users {
  readonly #people: Person[];
  #next: number;

  constructor(people: readonly Person[]) {
    super();
    this.#people = [...people];
    this.#next = Math.max(0, ...people.map((p) => p.id)) + 1;
  }

  override all(): readonly Person[] {
    return this.#people;
  }

  override async find(q: string): Promise<readonly Person[]> {
    const needle = q.trim().toLowerCase();
    return this.#people.filter((p) => p.name.toLowerCase().includes(needle));
  }

  override add(person: Omit<Person, 'id'>): Person {
    const added = { ...person, id: this.#next++ };
    this.#people.push(added);
    return added;
  }

  override setActive(id: number, active: boolean): void {
    const at = this.#at(id);
    this.#people[at] = { ...this.#people[at]!, active };
  }

  override remove(id: number): void {
    this.#people.splice(this.#at(id), 1);
  }

  #at(id: number): number {
    const at = this.#people.findIndex((p) => p.id === id);
    if (at === -1) throw notFound(`no hay nadie con id ${String(id)}`);
    return at;
  }
}
