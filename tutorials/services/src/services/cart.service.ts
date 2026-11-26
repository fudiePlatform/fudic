import { Service } from '@fudic/di';

// One for the whole app: inject(Cart) gives every component the same instance.
export class Cart {
  readonly items: string[] = [];

  add(name: string): number {
    this.items.push(name);
    return this.items.length;
  }
}
Service(Cart);
