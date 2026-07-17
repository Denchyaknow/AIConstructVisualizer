import { bootBrain } from '../shell.js';
import { createLoom, loomConfig } from '../constructs/loom.js';

bootBrain(createLoom, loomConfig);
