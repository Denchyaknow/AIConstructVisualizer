import { bootBrain } from '../shell.js';
import { createSingularity, singularityConfig } from '../constructs/singularity.js';

bootBrain(createSingularity, singularityConfig);
