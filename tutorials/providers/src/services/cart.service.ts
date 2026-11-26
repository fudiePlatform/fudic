// A component provides it with provide(): that component and the ones under it share one.
export class Cart {
  readonly items: string[] = [];

  add(name: string): number {
    this.items.push(name);
    return this.items.length;
  }
}
