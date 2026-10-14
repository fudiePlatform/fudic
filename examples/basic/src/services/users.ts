import { notFound } from '@fudic/http';
import { Service } from '@fudic/di';
import { addPerson, allPeople, removePerson, setActive, type Person } from '../data/people';

/**
 * What `/usuarios` asks of its data, from the server only: every function that calls it is a
 * server function, so not a line of this reaches the browser.
 */
export class Users {
  all(): readonly Person[] {
    return allPeople();
  }

  /** `delay` lets the page show a search being cancelled; the real one passes none. */
  async find(q: string, delay = 0): Promise<readonly Person[]> {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const needle = q.trim().toLowerCase();
    return allPeople().filter((p) => p.name.toLowerCase().includes(needle));
  }

  add(person: Omit<Person, 'id'>): Person {
    return addPerson(person);
  }

  setActive(id: number, active: boolean): void {
    if (!setActive(id, active)) throw notFound(`no hay nadie con id ${String(id)}`);
  }

  remove(id: number): void {
    if (!removePerson(id)) throw notFound(`no hay nadie con id ${String(id)}`);
  }
}
Service(Users);
