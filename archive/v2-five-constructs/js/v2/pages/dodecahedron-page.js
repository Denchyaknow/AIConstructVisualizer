import { bootBrain } from '../shell.js';
import { createDodecahedron, dodecahedronConfig } from '../constructs/dodecahedron.js';

bootBrain(createDodecahedron, dodecahedronConfig);
