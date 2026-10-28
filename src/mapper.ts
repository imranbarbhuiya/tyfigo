import process from 'node:process';

import { serve } from './mapper/rpc.ts';
import { createServer } from './mapper/server.ts';

await serve(createServer(), process.stdin, process.stdout);
