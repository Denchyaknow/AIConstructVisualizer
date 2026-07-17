import { bootBrain } from '../shell.js';
import { createRivenConduit, rivenConduitConfig } from '../constructs/riven-conduit.js';

bootBrain(createRivenConduit, rivenConduitConfig);
