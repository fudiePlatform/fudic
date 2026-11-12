// The fixture of `/gente` (SDD-82 §3.4), written as `@fudic/spec`'s helpers write their markers.
import { NOW } from '../services/now';

export default {
  data: {
    two: { title: 'Two', names: ['Ana', 'Luis'] },
    one: { title: 'One', names: ['Ana'] },
    down: { $fails: { status: 503, title: 'The base is down' } },
    away: { $redirects: '/blog/x', status: 303 },
  },
  calls: {
    renamed: { rename: 'renamed by the fixture' },
    again: { rename: 'the last one wins' },
  },
  services: {
    fixed: [{ provide: NOW, use: () => 'the fixture clock' }],
  },
};
