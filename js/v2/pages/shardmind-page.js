import { bootBrain } from '../shell.js';
import { createShardmind, shardmindConfig } from '../constructs/shardmind.js';

bootBrain(createShardmind, shardmindConfig);
