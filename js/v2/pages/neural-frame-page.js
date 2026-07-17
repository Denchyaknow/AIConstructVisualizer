import { bootBrain } from '../shell.js';
import { createNeuralFrame, neuralFrameConfig } from '../constructs/neural-frame.js';

bootBrain(createNeuralFrame, neuralFrameConfig);
