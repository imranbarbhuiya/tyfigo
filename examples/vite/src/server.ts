import config from '../config/server.config.jsonc';

const port: number = config.port;

console.log(JSON.stringify({ port, compression: config.compression, hasSecret: config.sessionSecret.length > 0 }));
