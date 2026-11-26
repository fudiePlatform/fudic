import { load } from 'fudic:routes/books';
import { allBooks } from '../books';

load.handle(async () => ({ books: await allBooks() }));
