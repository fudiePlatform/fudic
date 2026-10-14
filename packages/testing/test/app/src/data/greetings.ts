/** How many times the server actually ran `handle`. */
export const handled = { count: 0 };

export function greetingFor(name: string): string {
  return `Hello, ${name}`;
}
