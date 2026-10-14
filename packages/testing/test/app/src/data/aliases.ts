/** The data layer the server validator reads. It never reaches the browser. */
export async function aliasTaken(alias: string): Promise<boolean> {
  return Promise.resolve(alias === 'root');
}
