import { bootBrain } from '../shell.js';
import { createFractalConduit, fractalConduitConfig } from '../constructs/fractal-conduit.js';

bootBrain(createFractalConduit, fractalConduitConfig);
