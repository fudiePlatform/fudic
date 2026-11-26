// Where the books come from. Today a list; tomorrow, a database.
export async function allBooks() {
  return [
    { id: 1, title: 'The Hobbit' },
    { id: 2, title: 'Dune' },
    { id: 3, title: 'Emma' },
  ];
}
