// Where the books come from. Today a list; tomorrow, a database.
export async function allBooks() {
  return [
    { id: 1, title: 'The Hobbit' },
    { id: 2, title: 'Dune' },
    { id: 3, title: 'Emma' },
  ];
}

// The best seller of the week: a slow service, two seconds away.
export async function bestseller() {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return 'Dune';
}
