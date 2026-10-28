import config from '../config/app.config.json5';

const worker = {
	service: config.service,
	port: config.port,
	concurrency: config.queue.concurrency,
	maxDelayMs: Math.max(...config.retryDelaysMs),
	queueHost: new URL(config.queue.url).host,
};

console.log(JSON.stringify(worker));
