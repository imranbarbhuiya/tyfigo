import config from '../config/app.config.yaml';

console.log(
	JSON.stringify({
		name: config.name,
		port: config.http.port,
		cors: config.http.cors,
		mail: { from: config.mail.from, sandbox: config.mail.sandbox, hasApiKey: config.mail.apiKey.length > 0 },
	}),
);
