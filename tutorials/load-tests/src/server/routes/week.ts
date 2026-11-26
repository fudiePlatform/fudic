import { load } from 'fudic:routes/week';
import { bestseller } from '../books';

load.handle(() => ({ bestseller: bestseller() }));
