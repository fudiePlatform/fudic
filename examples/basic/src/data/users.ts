/**
 * The example's "user table", and the one thing it is here to do is TAKE TIME.
 *
 * `load` is the only `async` function of the system, so the `await` inside it is the only
 * window in which two responses of one server overlap. A lookup that resolves immediately
 * closes that window and proves nothing; one that waits a different amount per user opens
 * it wide and makes the overlap deterministic: the slow request enters first and leaves
 * last, with the fast one running to completion in between.
 */

const USERS: Readonly<Record<string, { readonly name: string; readonly delay: number }>> = {
  ana: { name: 'Ana', delay: 300 },
  luis: { name: 'Luis', delay: 20 },
};

/** The display name of a user, after the wait that user's row declares. */
export async function findUser(user: string): Promise<string> {
  const row = USERS[user];
  if (row === undefined) return 'desconocido';
  await new Promise((resolve) => setTimeout(resolve, row.delay));
  return row.name;
}
