import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const output = execFileSync(process.execPath, ['--import', 'tyfigo/register', 'src/main.ts'], {
	env: { PATH: process.env.PATH, NODE_ENV: 'production' },
	encoding: 'utf8',
});

assert.deepEqual(JSON.parse(output), {
	config: {
		name: 'tyfigo-config-dir-example',
		server: { host: '0.0.0.0', port: 8080 },
		database: { url: 'postgres://localhost:5432/app', pool: { max: 20 } },
		features: ['search', 'billing'],
	},
	port: 8080,
	owner: { name: 'tyfigo-config-dir-example', admin: true },
});
console.log('config-dir example: merged config ok');
