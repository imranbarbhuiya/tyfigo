import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const output = execFileSync(process.execPath, ['--import', 'tyfigo/register', 'src/main.ts'], {
	env: { PATH: process.env.PATH, NODE_ENV: 'production' },
	encoding: 'utf8',
});

assert.deepEqual(JSON.parse(output), {
	name: 'tyfigo-effect-example',
	logLevel: 'warn',
	port: 8080,
	database: { url: 'postgres://localhost:5432/app', passwordLength: 25 },
	jobs: { workers: 8, queues: ['default', 'emails'] },
});
console.log('effect example: merged config ok');
