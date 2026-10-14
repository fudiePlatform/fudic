/**
 * The "people table" of `/usuarios`: in memory, so every restart starts over.
 *
 * A module and not a service on purpose: the form's `serverValidator` reads it too, and the
 * validator is a plain function, not something that runs where a container is.
 */

export interface Person {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly age: number;
  readonly active: boolean;
  readonly notes: string;
}

const people: Person[] = [
  { id: 1, name: 'Ana', email: 'ana@fudic.dev', age: 34, active: true, notes: '' },
  { id: 2, name: 'Luis', email: 'luis@fudic.dev', age: 41, active: false, notes: '' },
  { id: 3, name: 'Marta', email: 'marta@fudic.dev', age: 29, active: true, notes: '' },
];

let next = people.length + 1;

export function allPeople(): readonly Person[] {
  return people;
}

export function addPerson(person: Omit<Person, 'id'>): Person {
  const added = { ...person, id: next++ };
  people.push(added);
  return added;
}

export function setActive(id: number, active: boolean): boolean {
  const at = people.findIndex((p) => p.id === id);
  if (at === -1) return false;
  people[at] = { ...people[at]!, active };
  return true;
}

export function removePerson(id: number): boolean {
  const at = people.findIndex((p) => p.id === id);
  if (at === -1) return false;
  people.splice(at, 1);
  return true;
}

/** Whether someone already uses `email`. Slow, as a real lookup would be. */
export async function emailTaken(email: string): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return people.some((p) => p.email.toLowerCase() === email.toLowerCase());
}
