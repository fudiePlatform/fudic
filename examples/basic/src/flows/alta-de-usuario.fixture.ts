// In a flow the server is the real one: the fixture only says where its data lives. Each `use`
// runs once per criterion, so what one criterion creates every page of it sees, and no other
// criterion does.
import type { FlowFixtures } from '@fudic/spec';
import type { Person } from 'fudic:routes/usuarios';
import { fails } from '@fudic/spec';
import { Users } from '../services/users';
import { MemoryUsers } from '../services/memory-users';

const ana: Person = { id: 1, name: 'Ana', email: 'ana@fudic.dev', age: 34, active: true, notes: '', avatar: false };
const luis: Person = { id: 2, name: 'Luis', email: 'luis@fudic.dev', age: 41, active: true, notes: '', avatar: false };

export default {
  services: {
    'dos-personas': [{ provide: Users, use: () => new MemoryUsers([ana, luis]) }],
    vacio: [{ provide: Users, use: () => new MemoryUsers([]) }],
  },
  calls: {
    'save-sin-red': { save: fails(0, 'network') },
  },
} satisfies FlowFixtures;
