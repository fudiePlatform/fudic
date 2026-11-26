// The users of the app. Today a list; tomorrow, a database.
const aliases = ['admin', 'ada', 'grace'];

export async function aliasTaken(alias: string) {
  return aliases.includes(alias);
}

export async function addUser(alias: string) {
  aliases.push(alias);
}
