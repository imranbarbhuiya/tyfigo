import config from '../config/server.config.yaml';

console.log(JSON.stringify({ port: config.port, cache: config.cache }));
