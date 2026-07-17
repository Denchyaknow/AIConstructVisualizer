import { bootBrain } from '../shell.js';
import { createFractalCorona, fractalCoronaConfig } from '../constructs/fractal-corona.js';

bootBrain(createFractalCorona, fractalCoronaConfig);
