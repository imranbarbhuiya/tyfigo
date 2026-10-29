import config from '../.config/app.yaml';

import type { User } from './users.ts';

const port: number = config.server.port;
const owner: User = { name: config.name, admin: true };

console.log(JSON.stringify({ config, port, owner }));
