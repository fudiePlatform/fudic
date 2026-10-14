import { chain, csrf } from '@fudic/http';

// The global chain of the test app: every server function walks it.
export default chain().use(csrf);
