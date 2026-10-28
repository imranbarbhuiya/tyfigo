import config from '../config/app.config.toml';

const listen: { port: number; idleTimeout: number } = {
	port: config.server.port,
	idleTimeout: config.server.idle_timeout,
};

console.log(JSON.stringify({ config, listen }));
