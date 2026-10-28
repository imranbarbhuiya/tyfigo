import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const output = execFileSync('bun', ['src/main.ts'], {
	env: { PATH: process.env.PATH, NODE_ENV: 'production' },
	encoding: 'utf8',
});

assert.deepEqual(JSON.parse(output), {
	config: {
		name: 'tyfigo-bun-example',
		log_level: 'warn',
		server: { port: 8080, idle_timeout: 30 },
		redis: { url: 'redis://localhost:6379', ttl: 3600 },
	},
	listen: { port: 8080, idleTimeout: 30 },
});
console.log('bun example: merged config ok');
