import { provideIn, type Container } from '@fudic/di';
import { GREETING } from './greeting';

// What an owner's `?ioc` module exports (SDD-38 §4.5): the registrations of its container.
export function register(container: Container): void {
  provideIn(container, GREETING, () => 'from the owner module');
}
